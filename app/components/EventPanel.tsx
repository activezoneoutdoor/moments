"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearEventCover, eventCoverUrl, setEventPhotoShared } from "@/lib/covers";
import { useStaffThumbnail } from "@/lib/thumbnails";
import { BookingsPanel } from "./BookingsPanel";
import {
  callFunction, coverMediaJoin, describeSync, driveFolderUrl, eventPageUrl, formatEventDate, isVideo, uploadLinkUrl,
  type AzoEvent, type Media, type MediaStatus, type SyncSummary,
} from "@/lib/events";

type UploadLink = { token: string; open: boolean; expires_at: string | null };

type Props = {
  supabase: SupabaseClient;
  event: AzoEvent;
  /** False for event leaders: they manage bookings and review media, but don't edit, share, publish or archive. */
  canManage?: boolean;
  onEdit: () => void;
  onChanged: (event: AzoEvent) => void;
};

const filters: { key: MediaStatus | "all"; label: string }[] = [
  { key: "pending", label: "To review" },
  { key: "approved", label: "Approved" },
  { key: "hidden", label: "Hidden" },
  { key: "all", label: "All" },
];

export function EventPanel({ supabase, event, canManage = true, onEdit, onChanged }: Props) {
  const [link, setLink] = useState<UploadLink | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [filter, setFilter] = useState<MediaStatus | "all">("pending");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [warn, setWarn] = useState(false);

  const load = useCallback(async () => {
    const [linkResult, mediaResult] = await Promise.all([
      supabase.from("event_upload_links").select("token, open, expires_at").eq("event_id", event.id).maybeSingle(),
      supabase.from("media").select("*").eq("event_id", event.id).order("sort_order").order("created_at"),
    ]);
    setLink(linkResult.data);
    setMedia((mediaResult.data ?? []) as Media[]);
  }, [supabase, event.id]);

  useEffect(() => { void load(); }, [load]);

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setMessage("");
    setWarn(false);
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setWarn(true);
    } finally {
      setBusy("");
    }
  }

  const refreshEvent = async () => {
    const { data } = await supabase.from("events").select(`*, ${coverMediaJoin}`).eq("id", event.id).single();
    if (data) onChanged(data as AzoEvent);
  };

  /**
   * Brings the album in line with the event's Drive folder (files added, deleted or renamed there).
   * Runs in the background when the event is opened, so the panel stays usable meanwhile.
   */
  const syncWithDrive = useCallback(async (quiet: boolean) => {
    setSyncing(true);
    try {
      const summary = await callFunction<SyncSummary>(supabase, "album-sync", { eventId: event.id });
      const changed = describeSync(summary);
      if (changed) {
        await load();
        const { data } = await supabase.from("events").select(`*, ${coverMediaJoin}`).eq("id", event.id).single();
        if (data) onChanged(data as AzoEvent);
      }
      const text = [changed || (quiet ? "" : "Already in sync with Drive."), summary.warning ?? ""].filter(Boolean).join(" ");
      if (text) {
        setMessage(text);
        setWarn(!!summary.warning);
      }
    } catch (error) {
      setMessage(`Couldn't sync with Drive: ${error instanceof Error ? error.message : String(error)}`);
      setWarn(true);
    } finally {
      setSyncing(false);
    }
    // onChanged is recreated by the parent on every render; syncing once per opened event is intended.
  }, [supabase, event.id, load]);

  // Album sync is staff-only; leaders review what participants uploaded through the link.
  useEffect(() => { if (canManage) void syncWithDrive(true); }, [canManage, syncWithDrive]);

  /** Re-syncs Drive sharing so a published album only exposes approved files. */
  const syncPublishedAlbum = () => callFunction(supabase, "album-publish", { eventId: event.id, publish: true });

  const setStatus = (ids: string[], status: MediaStatus) => run("status", async () => {
    const { error } = await supabase.from("media").update({ status }).in("id", ids);
    if (error) throw error;
    setMedia((items) => items.map((item) => ids.includes(item.id) ? { ...item, status } : item));
    if (event.album_status === "published") await syncPublishedAlbum();
  });

  // Using an album photo replaces any uploaded event photo.
  const setCover = (id: string) => run("cover", async () => {
    await clearEventCover(supabase, event, id);
    await refreshEvent();
  });

  const togglePublish = () => run("publish", async () => {
    const publish = event.album_status !== "published";
    await callFunction(supabase, "album-publish", { eventId: event.id, publish });
    // Publishing syncs with Drive first, so the album's files may have changed.
    await Promise.all([load(), refreshEvent()]);
    setMessage(publish ? "Album published." : "Album taken down.");
  });

  // Archiving keeps everything (media records, Drive folder, event photo) but takes it all off the public site:
  // Drive link sharing is removed, the event is hidden and uploads stop.
  const archive = () => run("archive", async () => {
    if (event.album_status === "published") await callFunction(supabase, "album-publish", { eventId: event.id, publish: false });
    if (event.cover_drive_file_id) await setEventPhotoShared(supabase, event, false);
    const { error } = await supabase.from("events").update({ status: "archived" }).eq("id", event.id);
    if (error) throw error;
    const { error: linkError } = await supabase.from("event_upload_links").update({ open: false }).eq("event_id", event.id);
    if (linkError) throw linkError;
    setArchiveOpen(false);
    setConfirmTitle("");
    await Promise.all([load(), refreshEvent()]);
  });

  // Restored events come back as drafts; staff publish the event and album again when ready.
  const restore = () => run("restore", async () => {
    const { error } = await supabase.from("events").update({ status: "draft" }).eq("id", event.id);
    if (error) throw error;
    if (event.cover_drive_file_id) await setEventPhotoShared(supabase, event, true);
    await refreshEvent();
    setMessage("Event restored as a draft. Publish it and its album again when ready.");
  });

  const rotateLink = () => run("link", async () => {
    if (!window.confirm("Create a new upload link? The current link will stop working.")) return;
    const { error } = await supabase.rpc("rotate_upload_link", { p_event_id: event.id });
    if (error) throw error;
    await load();
  });

  const toggleLink = () => run("link", async () => {
    const { error } = await supabase.from("event_upload_links").update({ open: !link?.open }).eq("event_id", event.id);
    if (error) throw error;
    await load();
  });

  const copyLink = () => run("copy", async () => {
    if (!link) return;
    await navigator.clipboard.writeText(uploadLinkUrl(link.token));
    setMessage("Upload link copied. Share it in the group chat.");
  });

  const counts = {
    pending: media.filter((m) => m.status === "pending").length,
    approved: media.filter((m) => m.status === "approved").length,
    hidden: media.filter((m) => m.status === "hidden").length,
    all: media.length,
  };
  const visible = filter === "all" ? media : media.filter((m) => m.status === filter);
  const pendingIds = media.filter((m) => m.status === "pending").map((m) => m.id);

  // An album photo used as the event photo may not be public yet, so staff load it through the thumbnail function.
  const albumCover = useStaffThumbnail(supabase, event.cover_drive_file_id ? null : event.cover_media_id, 1200);
  const coverUrl = eventCoverUrl(event) ?? albumCover;
  const archived = event.status === "archived";
  const albumIsPublic = event.album_status === "published";
  const confirmed = !albumIsPublic || confirmTitle.trim() === event.title.trim();

  return (
    <section className="event-panel">
      {coverUrl
        ? <img className="panel-cover" src={coverUrl} alt="" referrerPolicy="no-referrer" />
        : canManage && <button className="panel-cover empty" onClick={onEdit}>+ Add an event photo</button>}
      {archived && canManage && (
        <div className="archived-banner" role="status">
          <span><b>Archived.</b> Hidden from the public site; uploads are closed. Photos, videos and the Drive folder are kept.</span>
          <button className="primary-button" disabled={!!busy} onClick={restore}>Restore event</button>
        </div>
      )}
      <div className="panel-head">
        <div>
          <p className="eyebrow">{event.activity.toUpperCase()} · {event.status.toUpperCase()}</p>
          <h2>{event.title}</h2>
          <p className="event-meta">{formatEventDate(event)} · {event.location_name}</p>
          <p className="event-meta">
            {event.leader_name && <>Led by {event.leader_name}</>}
            {event.partners.length > 0 && <> · with {event.partners.join(", ")}</>}
            {event.max_participants && <> · max {event.max_participants} people</>}
          </p>
        </div>
        <div className="panel-actions">
          {canManage && <button className="ghost-button" onClick={onEdit}>Edit details</button>}
          {canManage && <button className="ghost-button" disabled={!!busy || syncing} onClick={() => { setMessage(""); void syncWithDrive(false); }}>{syncing ? "Syncing…" : "Sync with Drive"}</button>}
          {event.status !== "draft" && !archived && <a className="ghost-button" href={eventPageUrl(event.slug)} target="_blank" rel="noreferrer">Public page ↗</a>}
        </div>
      </div>

      {canManage && <div className="upload-link-card">
        <div>
          <p className="eyebrow">PARTICIPANT UPLOAD LINK</p>
          {link ? (
            <>
              <code className="link-text">{uploadLinkUrl(link.token)}</code>
              <p className="form-hint">{link.open ? "Anyone with this link can add photos and videos. No sign-in needed." : "Closed: the link no longer accepts uploads."}</p>
            </>
          ) : <p className="form-hint">Loading…</p>}
        </div>
        <div className="link-actions">
          <button className="primary-button" onClick={copyLink} disabled={!link?.open || !!busy}>Copy link</button>
          <button className="ghost-button" onClick={toggleLink} disabled={!link || !!busy}>{link?.open ? "Close uploads" : "Reopen uploads"}</button>
          <button className="ghost-button" onClick={rotateLink} disabled={!link || !!busy}>New link</button>
          {event.drive_folder_id && <a className="ghost-button" href={driveFolderUrl(event.drive_folder_id)} target="_blank" rel="noreferrer">Drive folder ↗</a>}
        </div>
      </div>}

      <BookingsPanel supabase={supabase} event={event} canManage={canManage} onEventChanged={refreshEvent} />

      <div className="section-heading album-heading" id="album-review">
        <div><p className="eyebrow">ALBUM · {event.album_status.toUpperCase()}</p><h2>Review media</h2></div>
        <div className="panel-actions">
          {pendingIds.length > 0 && <button className="ghost-button" disabled={!!busy} onClick={() => setStatus(pendingIds, "approved")}>Approve all {pendingIds.length}</button>}
          {canManage && <button className="primary-button" disabled={!!busy || (event.album_status !== "published" && (counts.approved === 0 || archived))} onClick={togglePublish}>
            {busy === "publish" ? "Working…" : event.album_status === "published" ? "Unpublish album" : "Publish album"}
          </button>}
        </div>
      </div>
      {event.album_status !== "published" && event.status === "draft" && counts.approved > 0 && <p className="form-hint">The album will be visible once the event is published too.</p>}
      {message && <p className={warn ? "panel-message warn" : "panel-message"} role="status">{message}</p>}

      <div className="filter-tabs" role="tablist">
        {filters.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>
            {f.label} <span>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="empty-state">{media.length === 0 ? "No uploads yet. Share the upload link with participants after the activity." : "Nothing here."}</p>
      ) : (
        <div className="media-grid">
          {visible.map((item) => (
            <figure key={item.id} className={`media-tile status-${item.status}`}>
              <a href={`https://drive.google.com/file/d/${item.drive_file_id}/view`} target="_blank" rel="noreferrer" className="media-thumb">
                <StaffThumb supabase={supabase} media={item} />
                {isVideo(item) && <span className="video-badge">▶ VIDEO</span>}
                {item.source === "drive" && <span className="drive-badge" title="Added directly in the Drive folder">ADDED IN DRIVE</span>}
                {event.cover_media_id === item.id && <span className="cover-badge">EVENT PHOTO</span>}
              </a>
              <figcaption>
                <span className="media-name" title={item.name}>{item.uploader_name ?? "Anonymous"}</span>
                <span className="media-actions">
                  {item.status !== "approved" && <button disabled={!!busy} onClick={() => setStatus([item.id], "approved")}>Approve</button>}
                  {item.status !== "hidden" && <button disabled={!!busy} onClick={() => setStatus([item.id], "hidden")}>Hide</button>}
                  {canManage && item.status === "approved" && !isVideo(item) && event.cover_media_id !== item.id && <button disabled={!!busy} onClick={() => setCover(item.id)} title="Use as event photo">Event photo</button>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {!archived && canManage && (
        <div className="danger-zone">
          {!archiveOpen ? (
            <button className="ghost-button danger" onClick={() => setArchiveOpen(true)}>Archive event…</button>
          ) : (
            <div className="archive-confirm">
              <p className="eyebrow">ARCHIVE EVENT</p>
              <p>
                The event disappears from the public site and its upload link stops working.
                {albumIsPublic
                  ? <> <b>Its album is public: {counts.approved} photo{counts.approved === 1 ? "" : "s"} and video{counts.approved === 1 ? "" : "s"} will be taken offline.</b></>
                  : null}{" "}
                Nothing is deleted: media and the Drive folder are kept, and you can restore the event later.
              </p>
              {albumIsPublic && (
                <label>Type the event name to confirm
                  <input value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} placeholder={event.title} />
                </label>
              )}
              <div className="form-actions">
                <button className="primary-button danger" disabled={!!busy || !confirmed} onClick={archive}>{busy === "archive" ? "Archiving…" : "Archive event"}</button>
                <button className="ghost-button" onClick={() => { setArchiveOpen(false); setConfirmTitle(""); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StaffThumb({ supabase, media }: { supabase: SupabaseClient; media: Media }) {
  const url = useStaffThumbnail(supabase, media.id);
  if (url) return <img src={url} alt={media.name} />;
  return <span className="thumb-placeholder">{url === undefined ? "Loading…" : isVideo(media) ? "Video preview not ready yet" : "No preview"}</span>;
}

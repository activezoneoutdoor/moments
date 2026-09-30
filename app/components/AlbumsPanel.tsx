"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatEventDate, type AzoEvent } from "@/lib/events";

type Album = { event: AzoEvent; pending: number; approved: number; hidden: number };

const albumLabel: Record<AzoEvent["album_status"], string> = { none: "No uploads", collecting: "Collecting", published: "Published" };

/**
 * Every event that has uploads, with what is left to review. Leaders see only the events they lead (row level
 * security filters both queries). "Review" opens the event on the Events tab at its album.
 */
export function AlbumsPanel({ supabase, onReview }: { supabase: SupabaseClient; onReview: (eventId: string) => void }) {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [filter, setFilter] = useState<"review" | "all">("review");
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      supabase.from("events").select("*").order("starts_at", { ascending: false }),
      supabase.from("media").select("event_id, status"),
    ]).then(([events, media]) => {
      if (events.error || media.error) return setError((events.error ?? media.error)!.message);
      const counts = new Map<string, Album>();
      for (const event of events.data as AzoEvent[]) counts.set(event.id, { event, pending: 0, approved: 0, hidden: 0 });
      for (const m of media.data as { event_id: string; status: "pending" | "approved" | "hidden" }[]) {
        const album = counts.get(m.event_id);
        if (album) album[m.status] += 1;
      }
      setAlbums(Array.from(counts.values()).filter((a) => a.pending + a.approved + a.hidden > 0 || a.event.album_status !== "none"));
    });
  }, [supabase]);

  const toReview = (albums ?? []).filter((a) => a.pending > 0);
  const shown = filter === "review" ? toReview : albums ?? [];

  return (
    <section className="album-section">
      <div className="section-heading">
        <div><h2>Albums: photos &amp; videos</h2></div>
      </div>
      <div className="filter-tabs" role="tablist">
        <button role="tab" aria-selected={filter === "review"} className={filter === "review" ? "active" : ""} onClick={() => setFilter("review")}>To review <span>{toReview.length}</span></button>
        <button role="tab" aria-selected={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All albums <span>{albums?.length ?? 0}</span></button>
      </div>
      {error && <p className="panel-message warn" role="alert">{error}</p>}
      {albums === null ? <p className="empty-state">Loading albums…</p> : shown.length === 0 ? (
        <p className="empty-state">{filter === "review" ? "Nothing to review. New uploads appear here." : "No albums yet. Share an event's upload link after the activity."}</p>
      ) : (
        <div className="booking-list album-list">
          <table>
            <thead><tr><th>Event</th><th>Album</th><th>To review</th><th>Approved</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {shown.map(({ event, pending, approved }) => (
                <tr key={event.id}>
                  <td className="booking-who"><b>{event.title}</b><span>{formatEventDate(event)} · {event.location_name}</span></td>
                  <td><span className={`pill ${event.album_status === "published" ? "status-published" : ""}`}>{albumLabel[event.album_status]}</span></td>
                  <td>{pending ? <span className="pill attention">{pending}</span> : "—"}</td>
                  <td>{approved || "—"}</td>
                  <td className="member-open"><button className="ghost-button" onClick={() => onReview(event.id)}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

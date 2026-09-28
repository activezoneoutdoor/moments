"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { driveThumbnail, eventPageUrl, formatEventDate, publicEventColumns, type AzoEvent } from "@/lib/events";
import { PublicShell } from "../components/Shell";

type ListedEvent = AzoEvent & { cover: { drive_file_id: string } | null };

export default function EventsPage() {
  const supabase = getSupabaseBrowserClient();
  const [events, setEvents] = useState<ListedEvent[] | null>(null);

  useEffect(() => {
    if (!supabase) return setEvents([]);
    void supabase
      .from("events")
      .select(`${publicEventColumns}, cover:media!events_cover_media_fk(drive_file_id)`)
      .in("status", ["published", "cancelled"])
      .order("starts_at", { ascending: false })
      .then(({ data }) => setEvents((data ?? []) as unknown as ListedEvent[]));
  }, [supabase]);

  const now = Date.now();
  const upcoming = (events ?? []).filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= now).reverse();
  const past = (events ?? []).filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() < now);

  return (
    <PublicShell>
      <section className="welcome">
        <p className="eyebrow">ACTIVE ZONE OUTDOOR · CYPRUS</p>
        <h1>Events &amp; albums.</h1>
        <p>Upcoming activities and the stories from the ones we&apos;ve shared.</p>
      </section>
      {events === null ? <p className="empty-state">Loading events…</p> : (
        <>
          <EventGrid title="Coming up" eyebrow="UPCOMING" events={upcoming} empty="New activities are announced soon." />
          <EventGrid title="Albums" eyebrow="PAST ACTIVITIES" events={past} empty="No past activities yet." />
        </>
      )}
    </PublicShell>
  );
}

function EventGrid({ title, eyebrow, events, empty }: { title: string; eyebrow: string; events: ListedEvent[]; empty: string }) {
  return (
    <section className="album-section">
      <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></div>
      {events.length === 0 ? <p className="empty-state">{empty}</p> : (
        <div className="event-cards">
          {events.map((e) => (
            <a key={e.id} className="event-card" href={eventPageUrl(e.slug)}>
              <div className="event-cover">
                {e.cover ? <img src={driveThumbnail(e.cover.drive_file_id, 800)} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="cover-fallback">{e.activity}</span>}
                {e.status === "cancelled" && <span className="pill status-cancelled">Cancelled</span>}
                {e.album_status === "published" && <span className="pill status-published">Album</span>}
              </div>
              <p className="eyebrow">{e.activity.toUpperCase()}</p>
              <h3>{e.title}</h3>
              <p className="event-meta">{formatEventDate(e)}<br />{e.location_name}</p>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

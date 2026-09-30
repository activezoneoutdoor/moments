"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eventCoverUrl } from "@/lib/covers";
import { useStaffThumbnail } from "@/lib/thumbnails";
import { coverMediaJoin, formatEventDate, type AzoEvent } from "@/lib/events";
import { EventForm } from "./EventForm";
import { EventPanel } from "./EventPanel";
import { useYearFilter, YearChips } from "./YearChips";

type Mode = { kind: "view" } | { kind: "new" } | { kind: "edit"; event: AzoEvent };

/**
 * canManage: admins and staff manage everything; leaders only see the events they lead (the database filters them).
 * openEventId: an event to open on arrival (from the Albums tab), scrolled to its album review.
 */
export function Dashboard({ supabase, canManage = true, openEventId }: { supabase: SupabaseClient; canManage?: boolean; openEventId?: string }) {
  const [events, setEvents] = useState<AzoEvent[]>([]);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [booked, setBooked] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(openEventId ?? null);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [tab, setTab] = useState<"upcoming" | "past" | "archived">("upcoming");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [eventResult, mediaResult, bookingResult] = await Promise.all([
      supabase.from("events").select(`*, ${coverMediaJoin}`).order("starts_at", { ascending: false }),
      supabase.from("media").select("event_id").eq("status", "pending"),
      supabase.from("bookings").select("event_id, seats").eq("status", "confirmed"),
    ]);
    if (eventResult.error) {
      setError(eventResult.error.message);
      return;
    }
    setEvents(eventResult.data as AzoEvent[]);
    const counts: Record<string, number> = {};
    for (const row of mediaResult.data ?? []) counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
    setPending(counts);
    const seats: Record<string, number> = {};
    for (const row of bookingResult.data ?? []) seats[row.event_id] = (seats[row.event_id] ?? 0) + row.seats;
    setBooked(seats);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  // Opened from the Albums tab: show the event's list tab and scroll to its album review once it has loaded.
  const [scrolledTo, setScrolledTo] = useState<string | null>(null);
  useEffect(() => {
    const opened = events.find((e) => e.id === openEventId);
    if (!opened || scrolledTo === opened.id) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setTab(opened.status === "archived" ? "archived" : new Date(opened.ends_at ?? opened.starts_at) >= today ? "upcoming" : "past");
    setScrolledTo(opened.id);
    window.setTimeout(() => document.getElementById("album-review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [events, openEventId, scrolledTo]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isUpcoming = (e: AzoEvent) => new Date(e.ends_at ?? e.starts_at) >= startOfToday;
  const active = events.filter((e) => e.status !== "archived");
  const upcoming = active.filter(isUpcoming).reverse();
  const past = active.filter((e) => !isUpcoming(e));
  const archived = events.filter((e) => e.status === "archived");
  const tabEvents = { upcoming, past, archived }[tab];
  // Year chips follow the tab's order: upcoming counts forward, past and archived backward.
  const yearFilter = useYearFilter(tabEvents);
  const list = yearFilter.filtered;
  const chooseTab = (next: typeof tab) => { setTab(next); yearFilter.setYear(null); };
  const selected = events.find((e) => e.id === selectedId) ?? null;

  const replaceEvent = (next: AzoEvent) => {
    setEvents((items) => items.some((e) => e.id === next.id) ? items.map((e) => e.id === next.id ? next : e) : [next, ...items]);
  };

  return (
    <section className="album-section dashboard">
      <div className="section-heading">
        <div><h2>{canManage ? "Events" : "Events you lead"}</h2></div>
        {canManage && <button className="primary-button" onClick={() => { setMode({ kind: "new" }); setSelectedId(null); }}>+ New event</button>}
      </div>
      {error && <p className="auth-notice" role="alert">{error}</p>}

      <div className="dashboard-grid">
        <aside className="event-list">
          <div className="filter-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "upcoming"} className={tab === "upcoming" ? "active" : ""} onClick={() => chooseTab("upcoming")}>Upcoming <span>{upcoming.length}</span></button>
            <button role="tab" aria-selected={tab === "past"} className={tab === "past" ? "active" : ""} onClick={() => chooseTab("past")}>Past <span>{past.length}</span></button>
            {archived.length > 0 && <button role="tab" aria-selected={tab === "archived"} className={tab === "archived" ? "active" : ""} onClick={() => chooseTab("archived")}>Archived <span>{archived.length}</span></button>}
          </div>
          <YearChips {...yearFilter} onChange={yearFilter.setYear} />
          {list.length === 0 && <p className="empty-state">{{ upcoming: canManage ? "No upcoming events. Create one to get an upload link." : "No upcoming events where you're the leader.", past: "No past events yet.", archived: "No archived events." }[tab]}</p>}
          {list.map((e) => (
            <button key={e.id} className={`event-row${e.id === selectedId ? " selected" : ""}`} onClick={() => { setSelectedId(e.id); setMode({ kind: "view" }); }}>
              <EventThumb supabase={supabase} event={e} />
              <span className="event-row-body">
                <span className="event-row-top"><b>{e.title}</b>{pending[e.id] ? <span className="pill attention">{pending[e.id]} to review</span> : null}</span>
                <span className="event-meta">{formatEventDate(e)} · {e.location_name}</span>
                <span className="event-row-tags">
                  <span className="pill">{e.activity}</span>
                  <span className={`pill status-${e.status}`}>{e.status}</span>
                  {e.album_status === "published" && <span className="pill status-published">album live</span>}
                  {(e.bookings_open || booked[e.id]) ? <span className="pill">{booked[e.id] ?? 0}{e.max_participants ? `/${e.max_participants}` : ""} booked</span> : null}
                </span>
              </span>
            </button>
          ))}
        </aside>

        <div className="dashboard-main">
          {canManage && mode.kind !== "view" ? (
            <EventForm
              key={mode.kind === "edit" ? mode.event.id : "new"}
              supabase={supabase}
              event={mode.kind === "edit" ? mode.event : null}
              onCancel={() => setMode({ kind: "view" })}
              onSaved={(saved, warning) => { replaceEvent(saved); setSelectedId(saved.id); setMode({ kind: "view" }); setError(warning ?? ""); }}
            />
          ) : selected ? (
            <EventPanel
              key={selected.id}
              supabase={supabase}
              event={selected}
              canManage={canManage}
              onEdit={() => setMode({ kind: "edit", event: selected })}
              onChanged={(next) => { replaceEvent(next); void load(); }}
            />
          ) : !canManage ? (
            <div className="empty-panel">
              <p className="eyebrow">AS EVENT LEADER</p>
              <ol>
                <li><b>Choose an event</b> you lead from the list.</li>
                <li><b>Bookings</b>: see who&apos;s coming, record payments and cancel bookings when needed.</li>
                <li><b>Album</b>: approve or hide the photos and videos participants shared. Staff publish the album.</li>
              </ol>
            </div>
          ) : (
            <div className="empty-panel">
              <p className="eyebrow">HOW IT WORKS</p>
              <ol>
                <li><b>Create the event</b>: date, place, leader, partners, capacity.</li>
                <li><b>Share its upload link</b> with participants. No account needed; files go straight to the event&apos;s Google Drive folder.</li>
                <li><b>Review and publish</b>: approve the best shots and publish the album on the public event page.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function EventThumb({ supabase, event }: { supabase: SupabaseClient; event: AzoEvent }) {
  // An album photo used as the event photo may not be public yet, so it comes through the thumbnail function.
  const albumCover = useStaffThumbnail(supabase, event.cover_drive_file_id ? null : event.cover_media_id, 160);
  const url = eventCoverUrl(event) ?? albumCover;
  return <span className="event-thumb">{url && <img src={url} alt="" loading="lazy" />}</span>;
}

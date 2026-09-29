"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendQueuedEmails, type Booking, type BookingEmail } from "@/lib/bookings";
import type { AzoEvent } from "@/lib/events";

type Props = { supabase: SupabaseClient; event: AzoEvent; onEventChanged: () => Promise<void> };

const bookedAt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia" });

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Staff view of an event's bookings: capacity, confirmed list, waitlist, cancellations and CSV export. */
export function BookingsPanel({ supabase, event, onEventChanged }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from("bookings")
      .select("*, emails:email_outbox(kind, recipient, status, last_error, created_at)").eq("event_id", event.id).order("created_at");
    if (loadError) setError(loadError.message);
    else setBookings((data ?? []) as Booking[]);
  }, [supabase, event.id]);

  useEffect(() => { void load(); }, [load]);

  const act = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  const toggleOpen = () => act(async () => {
    const { error: updateError } = await supabase.from("events").update({ bookings_open: !event.bookings_open }).eq("id", event.id);
    if (updateError) throw updateError;
    await onEventChanged();
  });

  // Cancelling a confirmed booking promotes the waitlist in the database (see the bookings migration).
  const cancel = (booking: Booking) => act(async () => {
    if (!window.confirm(`Cancel ${booking.contact_name}'s booking (${booking.seats} seat${booking.seats === 1 ? "" : "s"})?`)) return;
    const { error: updateError } = await supabase.from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "staff" }).eq("id", booking.id);
    if (updateError) throw updateError;
    sendQueuedEmails(supabase);
    await load();
    // Give the emails a moment, then show whether they went out.
    window.setTimeout(() => { void load(); }, 4000);
  });

  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const waitlisted = bookings.filter((b) => b.status === "waitlisted");
  const cancelled = bookings.filter((b) => b.status === "cancelled");
  const seats = confirmed.reduce((sum, b) => sum + b.seats, 0);
  const waitingSeats = waitlisted.reduce((sum, b) => sum + b.seats, 0);

  const failedEmails = bookings.flatMap((b) => (b.emails ?? []).filter((e) => e.status === "failed"));

  const exportCsv = () => {
    const rows = [["Status", "Attendee", "Booked by", "Email", "Phone", "Note", "Booked at"]];
    for (const b of [...confirmed, ...waitlisted]) {
      for (const attendee of b.attendees) {
        rows.push([b.status, attendee, b.contact_name, b.email, b.phone ?? "", b.note ?? "", new Date(b.created_at).toISOString()]);
      }
    }
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${event.slug}-participants.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="bookings-panel">
      <div className="section-heading album-heading">
        <div>
          <p className="eyebrow">BOOKINGS · {event.bookings_open ? "OPEN" : "CLOSED"}</p>
          <h2>{event.max_participants ? `${seats} of ${event.max_participants} seats booked` : `${seats} seats booked`}</h2>
        </div>
        <div className="panel-actions">
          {confirmed.length + waitlisted.length > 0 && <button className="ghost-button" onClick={exportCsv}>Export list</button>}
          <button className={event.bookings_open ? "ghost-button" : "primary-button"} disabled={busy} onClick={toggleOpen}>
            {event.bookings_open ? "Close bookings" : "Open bookings"}
          </button>
        </div>
      </div>
      {event.max_participants && <div className="capacity-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (seats / event.max_participants) * 100)}%` }} /></div>}
      {!event.bookings_open && bookings.length === 0 && <p className="form-hint">Open bookings to show a booking form on the public event page.</p>}
      {event.bookings_open && event.status !== "published" && <p className="form-hint">The booking form appears once the event is published.</p>}
      {error && <p className="panel-message warn" role="alert">{error}</p>}
      {failedEmails.length > 0 && (
        <p className="panel-message warn" role="alert">
          {failedEmails.length} email{failedEmails.length === 1 ? "" : "s"} could not be sent{failedEmails.some((e) => e.recipient === "leader") ? " (including to the leader)" : ""}: {failedEmails[0].last_error}
        </p>
      )}

      <BookingList title="Confirmed" bookings={confirmed} busy={busy} onCancel={cancel} />
      {waitlisted.length > 0 && <BookingList title={`Waitlist · ${waitingSeats} seat${waitingSeats === 1 ? "" : "s"}`} bookings={waitlisted} busy={busy} onCancel={cancel} numbered />}
      {cancelled.length > 0 && (
        <button className="link-button" onClick={() => setShowCancelled(!showCancelled)}>
          {showCancelled ? "Hide" : "Show"} {cancelled.length} cancelled
        </button>
      )}
      {showCancelled && <BookingList title="Cancelled" bookings={cancelled} busy={busy} />}
    </div>
  );
}

function BookingList({ title, bookings, busy, onCancel, numbered = false }: {
  title: string; bookings: Booking[]; busy: boolean; onCancel?: (booking: Booking) => void; numbered?: boolean;
}) {
  return (
    <div className="booking-list">
      <p className="eyebrow">{title.toUpperCase()}</p>
      {bookings.length === 0 ? <p className="form-hint">No bookings yet.</p> : (
        <table>
          <tbody>
            {bookings.map((b, i) => (
              <tr key={b.id}>
                <td className="booking-who">
                  <b>{numbered ? `#${i + 1} ` : ""}{b.attendees.join(", ")}</b>
                  <span>{b.contact_name} · <a href={`mailto:${b.email}`}>{b.email}</a>{b.phone ? <> · <a href={`tel:${b.phone}`}>{b.phone}</a></> : null}</span>
                  {b.note && <span className="booking-note">“{b.note}”</span>}
                  <EmailState emails={b.emails} />
                </td>
                <td className="booking-seats">{b.seats} seat{b.seats === 1 ? "" : "s"}</td>
                <td className="booking-when">{bookedAt.format(new Date(b.created_at))}{b.promoted_at ? " · promoted" : ""}{b.cancel_reason ? ` · ${cancelledBy[b.cancel_reason]}` : ""}</td>
                <td className="booking-actions">{onCancel && <button disabled={busy} onClick={() => onCancel(b)}>Cancel</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const cancelledBy: Record<string, string> = { participant: "cancelled by participant", staff: "cancelled by staff", event_cancelled: "event cancelled" };

const emailLabels: Record<string, string> = {
  confirmed: "confirmation", waitlisted: "waitlist notice", promoted: "seat-freed notice", cancelled: "cancellation",
  reminder: "reminder", event_cancelled: "event cancellation",
};

/** The latest email about a booking and whether it went out. */
function EmailState({ emails }: { emails?: BookingEmail[] }) {
  const latest = [...(emails ?? [])].filter((e) => e.recipient === "participant" && e.status !== "skipped").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest) return null;
  const label = emailLabels[latest.kind] ?? latest.kind;
  const state = latest.status === "sent" ? "sent" : latest.status === "failed" ? "failed" : "sending…";
  return <span className={`booking-email ${latest.status}`} title={latest.last_error ?? undefined}>✉ {label} {state}</span>;
}

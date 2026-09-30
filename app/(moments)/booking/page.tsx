"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cancelBooking, getBooking, type PrivateBooking } from "@/lib/bookings";
import { eventPageUrl, formatEventDate } from "@/lib/events";
import { PublicShell } from "@/app/components/Shell";
import { PaymentBox } from "@/app/components/PaymentBox";

const statusText = {
  confirmed: "Confirmed",
  waitlisted: "On the waitlist",
  cancelled: "Cancelled",
};

/** A participant's booking, reached through its private link. */
export default function BookingPage() {
  const supabase = getSupabaseBrowserClient();
  const [token, setToken] = useState("");
  const [booking, setBooking] = useState<PrivateBooking | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async (t: string) => {
    if (!supabase || !t) return setBooking(null);
    setBooking(await getBooking(supabase, t).catch(() => null));
  };

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    setToken(t);
    void load(t);
    // Loads once for the token in the address.
  }, [supabase]);

  async function cancel() {
    if (!supabase || !booking) return;
    if (!window.confirm(`Cancel your ${booking.seats === 1 ? "seat" : `${booking.seats} seats`} for ${booking.event_title}?`)) return;
    setBusy(true);
    setError("");
    try {
      await cancelBooking(supabase, token);
      await load(token);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicShell>
      <section className="upload-page">
        {booking === undefined && <p className="empty-state">Loading your booking…</p>}
        {booking === null && (
          <div className="empty-panel"><p className="eyebrow">BOOKING</p><h1>Booking not found.</h1><p>Check that you opened the full link from your booking.</p></div>
        )}
        {booking && (
          <>
            <p className="eyebrow">YOUR BOOKING</p>
            <h1>{booking.event_title}</h1>
            <p className="event-meta">{formatEventDate({ starts_at: booking.event_starts_at, ends_at: null })} · {booking.event_location}</p>
            <div className={`booking-card booking-done ${booking.status}`}>
              <b>
                {statusText[booking.status]}
                {booking.status === "waitlisted" && booking.waitlist_position ? ` · #${booking.waitlist_position} in line` : ""}
              </b>
              <p>
                {booking.status === "confirmed" && `${booking.seats === 1 ? "1 seat" : `${booking.seats} seats`} booked.`}
                {booking.status === "waitlisted" && "If seats free up, your booking is confirmed automatically. Check back here."}
                {booking.status === "cancelled" && {
                  event_cancelled: "This event was cancelled, so your booking is cancelled too.",
                  participant: "You cancelled this booking.",
                  staff: "The organisers cancelled this booking.",
                }[booking.cancel_reason ?? "staff"]}
              </p>
              {booking.cancellation_note && <blockquote className="booking-message">{booking.cancellation_note}</blockquote>}
              <PaymentBox booking={booking} />
              <dl className="booking-details">
                <div><dt>Seats</dt><dd>{booking.attendees.join(", ")}</dd></div>
                <div><dt>Contact</dt><dd>{booking.contact_name} · {booking.email}{booking.phone ? ` · ${booking.phone}` : ""}</dd></div>
              </dl>
              {error && <p className="auth-notice" role="alert">{error}</p>}
              <div className="form-actions">
                <a className="ghost-button" href={eventPageUrl(booking.event_slug)}>Event details</a>
                {booking.can_cancel && <button className="ghost-button danger" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Cancel booking"}</button>}
              </div>
            </div>
          </>
        )}
      </section>
    </PublicShell>
  );
}

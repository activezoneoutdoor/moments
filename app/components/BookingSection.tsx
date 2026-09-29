"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookEvent, bookingPageUrl, getBookingStatus, MAX_SEATS_PER_BOOKING, rememberedBooking, seatsLabel,
  type BookingStatus, type PublicBookingStatus,
} from "@/lib/bookings";

type Result = { token: string; status: BookingStatus; waitlist_position: number | null };

const closeFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia" });

/** Seats left and the booking form on the public event page. */
export function BookingSection({ supabase, eventId }: { supabase: SupabaseClient; eventId: string }) {
  const [status, setStatus] = useState<PublicBookingStatus | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    setExisting(rememberedBooking(eventId));
    void getBookingStatus(supabase, eventId).then(setStatus).catch(() => setStatus(null));
  }, [supabase, eventId]);

  // Bookings never opened for this event: show nothing.
  if (!status || (!status.open && status.confirmed_seats === 0 && status.waitlisted === 0)) return null;

  const full = status.capacity !== null && !status.available;

  return (
    <section className="album-section booking-section" id="book">
      <div className="section-heading">
        <div><p className="eyebrow">BOOKING</p><h2>{status.open ? (full ? "Join the waitlist" : "Book your seat") : "Bookings closed"}</h2></div>
        <span className={`pill ${full ? "status-cancelled" : "status-published"}`}>{seatsLabel(status)}</span>
      </div>

      {result ? (
        <BookingDone result={result} />
      ) : !status.open ? (
        <p className="empty-state">Bookings for this event are closed.</p>
      ) : existing && !showForm ? (
        <div className="booking-card">
          <p>You already booked for this event from this device.</p>
          <div className="form-actions">
            <a className="primary-button" href={bookingPageUrl(existing)}>View your booking</a>
            <button className="ghost-button" onClick={() => setShowForm(true)}>Book for someone else</button>
          </div>
        </div>
      ) : (
        <>
          <p className="form-hint booking-intro">
            {full
              ? "The event is full. Join the waitlist: if seats free up, the first bookings in line are confirmed automatically."
              : "Seats are confirmed straight away. No account needed."}{" "}
            Bookings close {closeFormat.format(new Date(status.closes_at))}.
          </p>
          <BookingForm supabase={supabase} eventId={eventId} maxSeats={status.capacity ?? MAX_SEATS_PER_BOOKING} onBooked={(r) => { setResult(r); setExisting(r.token); void getBookingStatus(supabase, eventId).then(setStatus); }} />
        </>
      )}
    </section>
  );
}

function BookingForm({ supabase, eventId, maxSeats, onBooked }: {
  supabase: SupabaseClient; eventId: string; maxSeats: number; onBooked: (result: Result) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [seats, setSeats] = useState(1);
  const [friends, setFriends] = useState<string[]>(["", "", ""]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const seatChoices = Array.from({ length: Math.min(MAX_SEATS_PER_BOOKING, maxSeats) }, (_, i) => i + 1);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      onBooked(await bookEvent(supabase, {
        eventId, name, email, phone, note,
        attendees: [name, ...friends.slice(0, seats - 1)].map((n) => n.trim()),
      }));
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : String(bookingError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="booking-card booking-form" onSubmit={submit}>
      <div className="form-grid">
        <label>Your name<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>Email<input required type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label><span>Phone <small>optional, for last-minute changes</small></span><input type="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
        <label>Seats<select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
          {seatChoices.map((n) => <option key={n} value={n}>{n === 1 ? "Just me" : `Me + ${n - 1}`}</option>)}
        </select></label>
        {Array.from({ length: seats - 1 }, (_, i) => (
          <label key={i}>Friend {i + 1} name
            <input required maxLength={100} value={friends[i]} onChange={(e) => setFriends(friends.map((f, j) => j === i ? e.target.value : f))} />
          </label>
        ))}
        <label className="span-2"><span>Note <small>optional</small></span><textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {error && <p className="auth-notice" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "Booking…" : `Book ${seats === 1 ? "1 seat" : `${seats} seats`}`}</button>
      </div>
    </form>
  );
}

function BookingDone({ result }: { result: Result }) {
  const url = bookingPageUrl(result.token);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // The link stays visible to copy by hand.
    }
  };

  return (
    <div className={`booking-card booking-done ${result.status}`} role="status">
      <b>{result.status === "confirmed" ? "You're booked! 🎉" : `You're on the waitlist (#${result.waitlist_position})`}</b>
      <p>
        {result.status === "confirmed"
          ? "Your seats are confirmed."
          : "If seats free up, your booking is confirmed automatically. Check your booking link for updates."}{" "}
        <strong>Save this link:</strong> it&apos;s the only way to view or cancel your booking.
      </p>
      <code className="link-text">{url}</code>
      <div className="form-actions">
        <a className="primary-button" href={url}>View booking</a>
        <button className="ghost-button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
      </div>
    </div>
  );
}

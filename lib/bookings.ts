import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingStatus = "confirmed" | "waitlisted" | "cancelled";
export const MAX_SEATS_PER_BOOKING = 4;

export type BookingEmail = { kind: string; status: "queued" | "sending" | "sent" | "skipped" | "failed"; last_error: string | null; created_at: string };

export type Booking = {
  id: string;
  event_id: string;
  contact_name: string;
  email: string;
  phone: string | null;
  attendees: string[];
  seats: number;
  note: string | null;
  status: BookingStatus;
  created_at: string;
  promoted_at: string | null;
  cancelled_at: string | null;
  /** Present when loaded with the email_outbox relation (staff only). */
  emails?: BookingEmail[];
};

export type PublicBookingStatus = {
  open: boolean;
  capacity: number | null;
  confirmed_seats: number;
  available: number | null;
  waitlisted: number;
  closes_at: string;
};

export type PrivateBooking = {
  status: BookingStatus;
  contact_name: string;
  email: string;
  phone: string | null;
  attendees: string[];
  seats: number;
  created_at: string;
  waitlist_position: number | null;
  event_title: string;
  event_slug: string;
  event_starts_at: string;
  event_location: string;
  can_cancel: boolean;
};

async function rpcRows<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export async function getBookingStatus(supabase: SupabaseClient, eventId: string): Promise<PublicBookingStatus | null> {
  return (await rpcRows<PublicBookingStatus>(supabase, "public_booking_status", { p_event_id: eventId }))[0] ?? null;
}

export async function bookEvent(supabase: SupabaseClient, input: {
  eventId: string; name: string; email: string; phone: string; attendees: string[]; note: string;
}): Promise<{ token: string; status: BookingStatus; waitlist_position: number | null }> {
  const [result] = await rpcRows<{ token: string; status: BookingStatus; waitlist_position: number | null }>(supabase, "book_event", {
    p_event_id: input.eventId,
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone,
    p_attendees: input.attendees,
    p_note: input.note,
  });
  rememberBooking(input.eventId, result.token);
  sendQueuedEmails(supabase);
  return result;
}

export async function getBooking(supabase: SupabaseClient, token: string): Promise<PrivateBooking | null> {
  return (await rpcRows<PrivateBooking>(supabase, "get_booking", { p_token: token }))[0] ?? null;
}

export async function cancelBooking(supabase: SupabaseClient, token: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_booking", { p_token: token });
  if (error) throw new Error(error.message);
  sendQueuedEmails(supabase);
}

/**
 * Asks the send-emails function to send what the database just queued (confirmations, cancellations,
 * waitlist promotions). Fire and forget: a scheduled run retries anything missed.
 */
export function sendQueuedEmails(supabase: SupabaseClient): void {
  void supabase.functions.invoke("send-emails", { body: {} }).catch(() => undefined);
}

export function bookingPageUrl(token: string): string {
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/booking/?t=${encodeURIComponent(token)}`;
}

// The booking link is the only way back to a booking, so this browser also remembers it per event.
const storageKey = (eventId: string) => `azo-booking-${eventId}`;

export function rememberBooking(eventId: string, token: string) {
  try { localStorage.setItem(storageKey(eventId), token); } catch { /* storage unavailable */ }
}

export function rememberedBooking(eventId: string): string | null {
  try { return localStorage.getItem(storageKey(eventId)); } catch { return null; }
}

export function seatsLabel(status: PublicBookingStatus): string {
  if (status.capacity === null) return `${status.confirmed_seats} booked`;
  if (!status.available) return `Fully booked${status.waitlisted ? ` · ${status.waitlisted} on the waitlist` : ""}`;
  return `${status.available} of ${status.capacity} seats left`;
}

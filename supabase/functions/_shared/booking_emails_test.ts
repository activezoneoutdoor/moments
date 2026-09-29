import { assertEquals, assertStringIncludes } from "@std/assert";
import { isStale, type QueuedEmail, renderBookingEmail, renderLeaderEmail, renderLeaderSummary } from "./booking_emails.ts";

const row: QueuedEmail = {
  id: "o1", kind: "confirmed", recipient: "participant", attempts: 1, period_start: null, event_id: "e1",
  booking_token: "tok/1", booking_status: "confirmed", cancel_reason: null,
  contact_name: "Maria Georgiou", email: "maria@example.com", phone: "+357 99 123456", note: "Vegetarian lunch",
  attendees: ["Maria", "Nikos"], seats: 2, waitlist_position: null, max_participants: 12, cancellation_note: null,
  event_title: "Sunrise SUP <Konnos>", event_slug: "2026-10-03-sup-konnos", event_starts_at: "2026-10-03T05:00:00Z",
  event_ends_at: "2026-10-03T07:00:00Z", event_location: "Konnos Bay", event_lat: null, event_lng: null,
  leader_name: "Andreas", leader_email: "andreas@activezoneoutdoor.cy",
};

Deno.test("confirmation has the Cyprus time, seats, private link and replies to the leader", () => {
  const email = renderBookingEmail(row, "https://moments.activezoneoutdoor.cy/");
  assertEquals(email.subject, "You're booked: Sunrise SUP <Konnos>");
  assertEquals(email.to, "maria@example.com");
  assertEquals(email.replyTo, "andreas@activezoneoutdoor.cy");
  assertStringIncludes(email.text, "Hi Maria, you're booked!");
  assertStringIncludes(email.text, "When: Sat, 3 Oct 2026 · 08:00–10:00");
  assertStringIncludes(email.text, "Booking: 2 seats: Maria, Nikos");
  assertStringIncludes(email.text, "https://moments.activezoneoutdoor.cy/booking/?t=tok%2F1");
  assertStringIncludes(email.html, "Sunrise SUP &lt;Konnos&gt;");
});

Deno.test("each kind has its own message", () => {
  const subjects = (["waitlisted", "promoted", "cancelled", "reminder"] as const).map((kind) =>
    renderBookingEmail({ ...row, kind, waitlist_position: 2, leader_email: null }, "https://x.cy", "hello@activezoneoutdoor.cy")
  );
  assertEquals(subjects.map((e) => e.subject), [
    "On the waitlist: Sunrise SUP <Konnos>",
    "A seat freed up, you're in: Sunrise SUP <Konnos>",
    "Booking cancelled: Sunrise SUP <Konnos>",
    "Reminder: Sunrise SUP <Konnos> is coming up",
  ]);
  assertStringIncludes(subjects[0].text, "you're #2 on the waitlist");
  assertStringIncludes(subjects[2].text, "See the event: https://x.cy/event/?slug=2026-10-03-sup-konnos");
  assertEquals(subjects[0].replyTo, "hello@activezoneoutdoor.cy");
});

Deno.test("out-of-date emails are skipped", () => {
  assertEquals(isStale({ ...row, kind: "confirmed", booking_status: "cancelled" }), true);
  assertEquals(isStale({ ...row, kind: "reminder", booking_status: "cancelled" }), true);
  assertEquals(isStale({ ...row, kind: "waitlisted", booking_status: "confirmed" }), true);
  assertEquals(isStale({ ...row, kind: "promoted", booking_status: "confirmed" }), false);
  assertEquals(isStale({ ...row, kind: "cancelled", booking_status: "cancelled" }), false);
});

Deno.test("an event cancellation includes the organisers' message and points to other activities", () => {
  const email = renderBookingEmail(
    { ...row, kind: "event_cancelled", booking_status: "cancelled", cancel_reason: "event_cancelled", cancellation_note: "Strong winds, sorry!" },
    "https://x.cy",
  );
  assertEquals(email.subject, "Event cancelled: Sunrise SUP <Konnos>");
  assertStringIncludes(email.text, "Message from the organisers: Strong winds, sorry!");
  assertStringIncludes(email.text, "See other activities: https://x.cy");
  assertStringIncludes(email.html, "Strong winds, sorry!");
  assertEquals(isStale({ ...row, kind: "event_cancelled", booking_status: "cancelled" }), false);
});

Deno.test("a cancellation says whether the participant or the organisers cancelled", () => {
  const self = renderBookingEmail({ ...row, kind: "cancelled", booking_status: "cancelled", cancel_reason: "participant" }, "https://x.cy");
  const staff = renderBookingEmail({ ...row, kind: "cancelled", booking_status: "cancelled", cancel_reason: "staff" }, "https://x.cy");
  assertStringIncludes(self.text, "your booking is cancelled, as you asked");
  assertStringIncludes(staff.text, "the organisers have cancelled your booking");
});

Deno.test("a leader email reports the change and current seats, and replies go to the participant", () => {
  const email = renderLeaderEmail({ ...row, recipient: "leader" }, "https://x.cy", { confirmedSeats: 9, waitlistedSeats: 2 });
  assertEquals(email.to, "andreas@activezoneoutdoor.cy");
  assertEquals(email.replyTo, "maria@example.com");
  assertEquals(email.subject, "New booking: Maria Georgiou +1 · Sunrise SUP <Konnos>");
  assertStringIncludes(email.text, "Contact: maria@example.com · +357 99 123456");
  assertStringIncludes(email.text, "Note: Vegetarian lunch");
  assertStringIncludes(email.text, "Now: 9 of 12 seats booked · 2 on the waitlist");
  assertStringIncludes(email.text, "Manage bookings: https://x.cy/admin/");
  assertEquals(isStale({ ...row, recipient: "leader", booking_status: "cancelled" }), false);

  const cancelled = renderLeaderEmail({ ...row, recipient: "leader", kind: "cancelled", cancel_reason: "participant" }, "https://x.cy", { confirmedSeats: 7, waitlistedSeats: 0 });
  assertStringIncludes(cancelled.text, "Booking cancelled: Maria Georgiou (by the participant)");
});

Deno.test("the daily summary lists the day's changes", () => {
  const booking = (name: string) => ({ contact_name: name, attendees: [name], seats: 1, email: `${name.toLowerCase()}@example.com`, cancel_reason: null });
  const email = renderLeaderSummary(
    { ...row, kind: "leader_summary", recipient: "leader", booking_token: null, contact_name: null, email: null, attendees: null, seats: null },
    "https://x.cy",
    { confirmedSeats: 10, waitlistedSeats: 0 },
    { booked: [booking("Eleni"), booking("Petros")], waitlisted: [], promoted: [], cancelled: [{ ...booking("Kostas"), cancel_reason: "staff" }] },
  );
  assertEquals(email.subject, "Today's bookings: Sunrise SUP <Konnos> (10 of 12 seats booked)");
  assertStringIncludes(email.text, "2 new bookings, 1 cancelled");
  assertStringIncludes(email.text, "- Eleni (1 seat, eleni@example.com)");
  assertStringIncludes(email.text, "- Kostas (1 seat, kostas@example.com, by staff)");
  assertEquals(email.replyTo, null);
});

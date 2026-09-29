import { assertEquals, assertStringIncludes } from "@std/assert";
import { isStale, type QueuedEmail, renderBookingEmail } from "./booking_emails.ts";

const row: QueuedEmail = {
  id: "o1", kind: "confirmed", attempts: 1, booking_token: "tok/1", booking_status: "confirmed",
  contact_name: "Maria Georgiou", email: "maria@example.com", attendees: ["Maria", "Nikos"], seats: 2, waitlist_position: null,
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

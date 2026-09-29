// Booking email content: participant emails, per-change leader emails and the leader's daily summary.
// Pure, so it can be tested without sending anything.
import type { Email } from "./gmail.ts";

export type EmailKind = "confirmed" | "waitlisted" | "promoted" | "cancelled" | "reminder" | "event_cancelled" | "leader_summary";
export type CancelReason = "participant" | "staff" | "event_cancelled";

/** One queued email as returned by the claim_emails database function. Booking fields are null for summaries. */
export type QueuedEmail = {
  id: string;
  kind: EmailKind;
  recipient: "participant" | "leader";
  attempts: number;
  period_start: string | null;
  event_id: string;
  booking_token: string | null;
  booking_status: "confirmed" | "waitlisted" | "cancelled" | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  attendees: string[] | null;
  seats: number | null;
  waitlist_position: number | null;
  cancel_reason: CancelReason | null;
  event_title: string;
  event_slug: string;
  event_starts_at: string;
  event_ends_at: string | null;
  event_location: string;
  event_lat: number | null;
  event_lng: number | null;
  leader_name: string | null;
  leader_email: string | null;
  max_participants: number | null;
  cancellation_note: string | null;
};

/** Seats taken right now, for leader emails. */
export type Totals = { confirmedSeats: number; waitlistedSeats: number };

/** A booking as listed in the leader's daily summary. */
export type ActivityBooking = { contact_name: string; attendees: string[]; seats: number; email: string; cancel_reason: CancelReason | null };
export type Activity = { booked: ActivityBooking[]; waitlisted: ActivityBooking[]; promoted: ActivityBooking[]; cancelled: ActivityBooking[] };

const TIME_ZONE = "Asia/Nicosia";
const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });

function when(row: QueuedEmail): string {
  const start = new Date(row.event_starts_at);
  const text = `${dateFormat.format(start)} · ${timeFormat.format(start)}`;
  if (!row.event_ends_at) return text;
  const end = new Date(row.event_ends_at);
  return dateFormat.format(end) === dateFormat.format(start) ? `${text}–${timeFormat.format(end)}` : `${text} → ${dateFormat.format(end)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mapUrl(row: QueuedEmail): string {
  return row.event_lat != null && row.event_lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${row.event_lat},${row.event_lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.event_location)}`;
}

function seatText(seats: number, attendees: string[]): string {
  return `${seats} seat${seats === 1 ? "" : "s"}: ${attendees.join(", ")}`;
}

function capacityText(row: QueuedEmail, totals: Totals): string {
  const booked = row.max_participants ? `${totals.confirmedSeats} of ${row.max_participants} seats booked` : `${totals.confirmedSeats} seats booked`;
  return totals.waitlistedSeats ? `${booked} · ${totals.waitlistedSeats} on the waitlist` : booked;
}

type Layout = { intro: string; note?: string | null; details: [string, string][]; sections?: string; action: { label: string; url: string }; secondary?: { label: string; url: string } | null };

/** The shared look of every email: intro, optional quoted note, detail rows, optional sections, one button. */
function layout({ intro, note, details, sections = "", action, secondary }: Layout): string {
  const detailRows = details.map(([label, value]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6d776e;font-size:13px;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:4px 0;font-size:14px;color:#202720">${value}</td></tr>`
  ).join("\n");
  return `<!doctype html><html><body style="margin:0;background:#f6f7f1;font-family:Arial,Helvetica,sans-serif;color:#202720">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-size:11px;letter-spacing:1.6px;font-weight:bold;color:#738078;margin:0 0 18px">ACTIVE ZONE OUTDOOR</p>
<div style="background:#ffffff;border:1px solid #e3e7de;border-radius:8px;padding:24px">
<p style="font-size:15px;line-height:1.6;margin:0 0 18px">${intro}</p>
${note ? `<blockquote style="margin:0 0 18px;padding:10px 14px;border-left:3px solid #d7ec7a;background:#f7faf1;font-size:14px;line-height:1.6">${escapeHtml(note)}</blockquote>` : ""}
<table style="border-collapse:collapse;margin:0 0 20px">
${detailRows}
</table>
${sections}
<a href="${action.url}" style="display:inline-block;background:#1e4737;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:4px">${escapeHtml(action.label)}</a>
${secondary ? `<p style="font-size:13px;margin:16px 0 0"><a href="${secondary.url}" style="color:#1e4737">${escapeHtml(secondary.label)}</a></p>` : ""}
</div>
<p style="font-size:12px;color:#6d776e;line-height:1.6;margin:16px 4px 0">Questions? Just reply to this email.<br>Active Zone Outdoor</p>
</div></body></html>`;
}

/**
 * A participant email whose news is out of date by the time it's sent (a confirmation for a booking that was
 * cancelled meanwhile, a waitlist notice for someone already promoted) is skipped. Leader emails report what
 * happened, so they're always sent.
 */
export function isStale(row: QueuedEmail): boolean {
  if (row.recipient === "leader") return false;
  switch (row.kind) {
    case "confirmed":
    case "promoted":
    case "reminder":
      return row.booking_status !== "confirmed";
    case "waitlisted":
      return row.booking_status !== "waitlisted";
    default:
      return false;
  }
}

function urls(row: QueuedEmail, siteUrl: string) {
  const site = siteUrl.replace(/\/+$/, "");
  return {
    site,
    admin: `${site}/admin/`,
    booking: `${site}/booking/?t=${encodeURIComponent(row.booking_token ?? "")}`,
    event: `${site}/event/?slug=${encodeURIComponent(row.event_slug)}`,
  };
}

export function renderBookingEmail(row: QueuedEmail, siteUrl: string, fallbackReplyTo?: string | null): Email {
  const link = urls(row, siteUrl);
  const firstName = (row.contact_name ?? "").split(" ")[0];
  const seats = seatText(row.seats ?? 0, row.attendees ?? []);
  const cancelledLead = row.cancel_reason === "participant"
    ? "your booking is cancelled, as you asked. We hope to see you at another activity!"
    : "the organisers have cancelled your booking. If you didn't expect this, just reply to this email.";

  const content: Record<Exclude<EmailKind, "leader_summary">, { subject: string; lead: string; action: string }> = {
    confirmed: {
      subject: `You're booked: ${row.event_title}`,
      lead: "you're booked! Your seats are confirmed.",
      action: "View or cancel your booking",
    },
    waitlisted: {
      subject: `On the waitlist: ${row.event_title}`,
      lead: `the event is full, so you're #${row.waitlist_position ?? "?"} on the waitlist. If seats free up, your booking is confirmed automatically and we'll email you.`,
      action: "View or cancel your booking",
    },
    promoted: {
      subject: `A seat freed up, you're in: ${row.event_title}`,
      lead: "good news: seats freed up and your booking is now confirmed.",
      action: "View or cancel your booking",
    },
    cancelled: {
      subject: `Booking cancelled: ${row.event_title}`,
      lead: cancelledLead,
      action: "See the event",
    },
    event_cancelled: {
      subject: `Event cancelled: ${row.event_title}`,
      lead: "we're sorry: this event has been cancelled, so your booking is cancelled too. There's nothing else you need to do.",
      action: "See other activities",
    },
    reminder: {
      subject: `Reminder: ${row.event_title} is coming up`,
      lead: "see you soon! Here are the details. If you can't make it, please cancel so someone on the waitlist can have your seat.",
      action: "View or cancel your booking",
    },
  };
  const { subject, lead, action } = content[row.kind as Exclude<EmailKind, "leader_summary">];
  const actionUrl = row.kind === "event_cancelled" ? link.site : row.kind === "cancelled" ? link.event : link.booking;
  const note = row.kind === "event_cancelled" ? row.cancellation_note : null;
  const showEventLink = !["cancelled", "event_cancelled"].includes(row.kind);

  const text = [
    `Hi ${firstName}, ${lead}`,
    ...(note ? ["", `Message from the organisers: ${note}`] : []),
    "",
    row.event_title,
    `When: ${when(row)}`,
    `Where: ${row.event_location} (${mapUrl(row)})`,
    `Booking: ${seats}`,
    ...(row.leader_name ? [`Your leader: ${row.leader_name}`] : []),
    "",
    `${action}: ${actionUrl}`,
    ...(showEventLink ? [`Event details: ${link.event}`] : []),
    "",
    "Questions? Just reply to this email.",
    "Active Zone Outdoor",
  ].join("\n");

  const html = layout({
    intro: `Hi ${escapeHtml(firstName)}, ${escapeHtml(lead)}`,
    note,
    details: [
      ["Event", `<strong>${escapeHtml(row.event_title)}</strong>`],
      ["When", escapeHtml(when(row))],
      ["Where", `<a href="${mapUrl(row)}" style="color:#1e4737">${escapeHtml(row.event_location)}</a>`],
      ["Booking", escapeHtml(seats)],
      ...(row.leader_name ? [["Leader", escapeHtml(row.leader_name)] as [string, string]] : []),
    ],
    action: { label: action, url: actionUrl },
    secondary: showEventLink ? { label: "Event details", url: link.event } : null,
  });

  return {
    to: row.email ?? "",
    toName: row.contact_name ?? undefined,
    subject,
    text,
    html,
    replyTo: row.leader_email ?? fallbackReplyTo ?? null,
  };
}

const leaderHeadline: Record<string, (name: string, extra: number) => string> = {
  confirmed: (name, extra) => `New booking: ${name}${extra ? ` +${extra}` : ""}`,
  waitlisted: (name, extra) => `Joined the waitlist: ${name}${extra ? ` +${extra}` : ""}`,
  promoted: (name) => `Moved off the waitlist: ${name}`,
  cancelled: (name) => `Booking cancelled: ${name}`,
};

/** One booking change, for leaders who asked for every change. Replies go to the participant. */
export function renderLeaderEmail(row: QueuedEmail, siteUrl: string, totals: Totals): Email {
  const link = urls(row, siteUrl);
  const name = row.contact_name ?? "Someone";
  const headline = (leaderHeadline[row.kind] ?? leaderHeadline.confirmed)(name, (row.seats ?? 1) - 1);
  const who = row.cancel_reason === "staff" ? " (by staff)" : row.kind === "cancelled" ? " (by the participant)" : "";
  const contact = [row.email, row.phone].filter(Boolean).join(" · ");
  const seats = seatText(row.seats ?? 0, row.attendees ?? []);
  const capacity = capacityText(row, totals);

  const text = [
    `${headline}${who}`,
    "",
    row.event_title,
    `When: ${when(row)}`,
    `Booking: ${seats}`,
    `Contact: ${contact}`,
    ...(row.note ? [`Note: ${row.note}`] : []),
    `Now: ${capacity}`,
    "",
    `Manage bookings: ${link.admin}`,
    "Reply to this email to answer the participant.",
  ].join("\n");

  const html = layout({
    intro: `<strong>${escapeHtml(headline)}</strong>${escapeHtml(who)}`,
    note: row.note,
    details: [
      ["Event", `<strong>${escapeHtml(row.event_title)}</strong>`],
      ["When", escapeHtml(when(row))],
      ["Booking", escapeHtml(seats)],
      ["Contact", escapeHtml(contact)],
      ["Now", escapeHtml(capacity)],
    ],
    action: { label: "Manage bookings", url: link.admin },
  });

  return {
    to: row.leader_email ?? "",
    toName: row.leader_name ?? undefined,
    subject: `${headline} · ${row.event_title}`,
    text,
    html,
    replyTo: row.email,
  };
}

/** The leader's daily summary of booking activity since the previous one. */
export function renderLeaderSummary(row: QueuedEmail, siteUrl: string, totals: Totals, activity: Activity): Email {
  const link = urls(row, siteUrl);
  const capacity = capacityText(row, totals);
  const groups: [string, ActivityBooking[]][] = [
    ["New bookings", activity.booked],
    ["Joined the waitlist", activity.waitlisted],
    ["Moved off the waitlist", activity.promoted],
    ["Cancelled", activity.cancelled],
  ];
  const line = (b: ActivityBooking) =>
    `${b.attendees.join(", ")} (${b.seats} seat${b.seats === 1 ? "" : "s"}, ${b.email}${b.cancel_reason === "staff" ? ", by staff" : ""})`;
  const counts = groups.filter(([, list]) => list.length).map(([label, list]) => `${list.length} ${label.toLowerCase()}`).join(", ");

  const text = [
    `Today's bookings for ${row.event_title}: ${counts || "no changes"}.`,
    "",
    `When: ${when(row)}`,
    `Now: ${capacity}`,
    ...groups.flatMap(([label, list]) => list.length ? ["", `${label}:`, ...list.map((b) => `- ${line(b)}`)] : []),
    "",
    `Manage bookings: ${link.admin}`,
  ].join("\n");

  const sections = groups.filter(([, list]) => list.length).map(([label, list]) =>
    `<p style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#738078;margin:0 0 6px">${label.toUpperCase()}</p>
<ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.6">${list.map((b) => `<li>${escapeHtml(line(b))}</li>`).join("")}</ul>`
  ).join("\n");

  return {
    to: row.leader_email ?? "",
    toName: row.leader_name ?? undefined,
    subject: `Today's bookings: ${row.event_title} (${capacity})`,
    text,
    html: layout({
      intro: `Today's booking activity for <strong>${escapeHtml(row.event_title)}</strong>: ${escapeHtml(counts || "no changes")}.`,
      details: [["When", escapeHtml(when(row))], ["Now", escapeHtml(capacity)]],
      sections,
      action: { label: "Manage bookings", url: link.admin },
    }),
    replyTo: null,
  };
}

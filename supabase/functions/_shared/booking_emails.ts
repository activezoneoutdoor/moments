// Booking email content. Pure, so it can be tested without sending anything.
import type { Email } from "./gmail.ts";

export type EmailKind = "confirmed" | "waitlisted" | "promoted" | "cancelled" | "reminder";

/** One queued email as returned by the claim_emails database function. */
export type QueuedEmail = {
  id: string;
  kind: EmailKind;
  attempts: number;
  booking_token: string;
  booking_status: "confirmed" | "waitlisted" | "cancelled";
  contact_name: string;
  email: string;
  attendees: string[];
  seats: number;
  waitlist_position: number | null;
  event_title: string;
  event_slug: string;
  event_starts_at: string;
  event_ends_at: string | null;
  event_location: string;
  event_lat: number | null;
  event_lng: number | null;
  leader_name: string | null;
  leader_email: string | null;
};

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

/**
 * An email whose news is out of date by the time it's sent (a confirmation for a booking that was
 * cancelled meanwhile, a waitlist notice for someone already promoted) is skipped.
 */
export function isStale(row: QueuedEmail): boolean {
  switch (row.kind) {
    case "confirmed":
    case "promoted":
    case "reminder":
      return row.booking_status !== "confirmed";
    case "waitlisted":
      return row.booking_status !== "waitlisted";
    case "cancelled":
      return false;
  }
}

export function renderBookingEmail(row: QueuedEmail, siteUrl: string, fallbackReplyTo?: string | null): Email {
  const site = siteUrl.replace(/\/+$/, "");
  const bookingUrl = `${site}/booking/?t=${encodeURIComponent(row.booking_token)}`;
  const eventUrl = `${site}/event/?slug=${encodeURIComponent(row.event_slug)}`;
  const mapUrl = row.event_lat != null && row.event_lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${row.event_lat},${row.event_lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.event_location)}`;
  const firstName = row.contact_name.split(" ")[0];
  const seats = `${row.seats} seat${row.seats === 1 ? "" : "s"}: ${row.attendees.join(", ")}`;

  const content: Record<EmailKind, { subject: string; lead: string; action: string }> = {
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
      lead: "your booking has been cancelled. If you didn't expect this, just reply to this email.",
      action: "See the event",
    },
    reminder: {
      subject: `Reminder: ${row.event_title} is coming up`,
      lead: "see you soon! Here are the details. If you can't make it, please cancel so someone on the waitlist can have your seat.",
      action: "View or cancel your booking",
    },
  };
  const { subject, lead, action } = content[row.kind];
  const actionUrl = row.kind === "cancelled" ? eventUrl : bookingUrl;
  const replyTo = row.leader_email ?? fallbackReplyTo ?? null;
  const leader = row.leader_name ? `Your leader: ${row.leader_name}` : null;

  const lines = [
    `Hi ${firstName}, ${lead}`,
    "",
    row.event_title,
    `When: ${when(row)}`,
    `Where: ${row.event_location} (${mapUrl})`,
    `Booking: ${seats}`,
    ...(leader ? [leader] : []),
    "",
    `${action}: ${actionUrl}`,
    ...(row.kind === "cancelled" ? [] : [`Event details: ${eventUrl}`]),
    "",
    "Questions? Just reply to this email.",
    "Active Zone Outdoor",
  ];

  const detail = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6d776e;font-size:13px;vertical-align:top">${label}</td><td style="padding:4px 0;font-size:14px;color:#202720">${value}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f1;font-family:Arial,Helvetica,sans-serif;color:#202720">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-size:11px;letter-spacing:1.6px;font-weight:bold;color:#738078;margin:0 0 18px">ACTIVE ZONE OUTDOOR</p>
<div style="background:#ffffff;border:1px solid #e3e7de;border-radius:8px;padding:24px">
<p style="font-size:15px;line-height:1.6;margin:0 0 18px">Hi ${escapeHtml(firstName)}, ${escapeHtml(lead)}</p>
<h1 style="font-size:22px;margin:0 0 12px;color:#1e4737">${escapeHtml(row.event_title)}</h1>
<table style="border-collapse:collapse;margin:0 0 20px">
${detail("When", escapeHtml(when(row)))}
${detail("Where", `<a href="${mapUrl}" style="color:#1e4737">${escapeHtml(row.event_location)}</a>`)}
${detail("Booking", escapeHtml(seats))}
${row.leader_name ? detail("Leader", escapeHtml(row.leader_name)) : ""}
</table>
<a href="${actionUrl}" style="display:inline-block;background:#1e4737;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 18px;border-radius:4px">${action}</a>
${row.kind === "cancelled" ? "" : `<p style="font-size:13px;margin:16px 0 0"><a href="${eventUrl}" style="color:#1e4737">Event details</a></p>`}
</div>
<p style="font-size:12px;color:#6d776e;line-height:1.6;margin:16px 4px 0">Questions? Just reply to this email.<br>Active Zone Outdoor</p>
</div></body></html>`;

  return { to: row.email, toName: row.contact_name, subject, text: lines.join("\n"), html, replyTo };
}

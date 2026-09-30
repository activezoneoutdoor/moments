// Sends queued booking emails, and queues day-before reminders and leaders' daily summaries. Safe to call by
// anyone at any time: it only sends what the database queued. The site calls it right after booking or
// cancelling, and a Supabase cron job calls it every 15 minutes for reminders, summaries and retries.
import { admin } from "../_shared/db.ts";
import {
  type Activity,
  type ActivityBooking,
  isStale,
  type QueuedEmail,
  renderBookingEmail,
  renderLeaderEmail,
  renderLeaderSummary,
  type Totals,
} from "../_shared/booking_emails.ts";
import { type Email, sendEmail } from "../_shared/gmail.ts";
import { serveJson } from "../_shared/http.ts";

const MAX_ATTEMPTS = 5;

serveJson(async () => {
  const db = admin();
  for (const fn of ["queue_reminders", "queue_leader_summaries"]) {
    const { error } = await db.rpc(fn);
    if (error) throw error;
  }

  const { data, error } = await db.rpc("claim_emails", { p_limit: 25 });
  if (error) throw error;

  const siteUrl = Deno.env.get("SITE_URL") ?? "https://www2.activezoneoutdoor.cy";
  const replyTo = Deno.env.get("EMAIL_REPLY_TO") ?? null;
  const result = { sent: 0, skipped: 0, failed: 0 };

  const totalsCache = new Map<string, Totals>();
  const totalsFor = async (eventId: string): Promise<Totals> => {
    if (!totalsCache.has(eventId)) {
      const { data: rows, error: totalsError } = await db.from("bookings").select("status, seats").eq("event_id", eventId).neq("status", "cancelled");
      if (totalsError) throw totalsError;
      const sum = (status: string) => (rows ?? []).filter((r) => r.status === status).reduce((n, r) => n + r.seats, 0);
      totalsCache.set(eventId, { confirmedSeats: sum("confirmed"), waitlistedSeats: sum("waitlisted") });
    }
    return totalsCache.get(eventId)!;
  };

  // The participant emails queued since the last summary are the event's booking history.
  const activitySince = async (eventId: string, since: string): Promise<Activity> => {
    const { data: rows, error: activityError } = await db.from("email_outbox")
      .select("kind, created_at, booking:bookings(contact_name, attendees, seats, email, cancel_reason)")
      .eq("event_id", eventId).eq("recipient", "participant").gt("created_at", since)
      .in("kind", ["confirmed", "waitlisted", "promoted", "cancelled"]).order("created_at");
    if (activityError) throw activityError;
    const pick = (kind: string) =>
      (rows ?? []).filter((r) => r.kind === kind).map((r) => r.booking as unknown as ActivityBooking | null).filter((b): b is ActivityBooking => !!b);
    return { booked: pick("confirmed"), waitlisted: pick("waitlisted"), promoted: pick("promoted"), cancelled: pick("cancelled") };
  };

  const compose = async (row: QueuedEmail): Promise<Email | null> => {
    if (row.recipient === "participant") return isStale(row) ? null : renderBookingEmail(row, siteUrl, replyTo);
    if (!row.leader_email) return null; // The leader email was removed since this was queued.
    if (row.kind === "leader_summary") {
      const since = row.period_start ?? new Date(Date.now() - 864e5).toISOString();
      return renderLeaderSummary(row, siteUrl, await totalsFor(row.event_id), await activitySince(row.event_id, since));
    }
    return renderLeaderEmail(row, siteUrl, await totalsFor(row.event_id));
  };

  for (const row of (data ?? []) as QueuedEmail[]) {
    try {
      const email = await compose(row);
      if (!email) {
        await db.from("email_outbox").update({ status: "skipped" }).eq("id", row.id);
        result.skipped++;
        continue;
      }
      await sendEmail(email);
      await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      result.sent++;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      console.error(`Email ${row.id} (${row.kind} for ${row.recipient}) failed:`, message);
      await db.from("email_outbox").update({
        status: row.attempts >= MAX_ATTEMPTS ? "failed" : "queued",
        last_error: message.slice(0, 1000),
      }).eq("id", row.id);
      result.failed++;
    }
  }
  return result;
});

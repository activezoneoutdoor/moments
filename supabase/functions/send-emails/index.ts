// Sends queued booking emails (and queues day-before reminders). Safe to call by anyone at any time:
// it only sends what the database queued. The site calls it right after booking or cancelling, and a
// Supabase cron job calls it every 15 minutes for reminders and retries.
import { admin } from "../_shared/db.ts";
import { isStale, type QueuedEmail, renderBookingEmail } from "../_shared/booking_emails.ts";
import { sendEmail } from "../_shared/gmail.ts";
import { serveJson } from "../_shared/http.ts";

const MAX_ATTEMPTS = 5;

serveJson(async () => {
  const db = admin();
  const { error: reminderError } = await db.rpc("queue_reminders");
  if (reminderError) throw reminderError;

  const { data, error } = await db.rpc("claim_emails", { p_limit: 25 });
  if (error) throw error;

  const siteUrl = Deno.env.get("SITE_URL") ?? "https://moments.activezoneoutdoor.cy";
  const replyTo = Deno.env.get("EMAIL_REPLY_TO") ?? null;
  const result = { sent: 0, skipped: 0, failed: 0 };

  for (const row of (data ?? []) as QueuedEmail[]) {
    if (isStale(row)) {
      await db.from("email_outbox").update({ status: "skipped" }).eq("id", row.id);
      result.skipped++;
      continue;
    }
    try {
      await sendEmail(renderBookingEmail(row, siteUrl, replyTo));
      await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      result.sent++;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      console.error(`Email ${row.id} (${row.kind} to ${row.email}) failed:`, message);
      await db.from("email_outbox").update({
        status: row.attempts >= MAX_ATTEMPTS ? "failed" : "queued",
        last_error: message.slice(0, 1000),
      }).eq("id", row.id);
      result.failed++;
    }
  }
  return result;
});

// Supabase Auth "Send Email" hook (Authentication → Hooks → Send Email → HTTPS, this function's URL).
// Sends sign-in codes through the organisation's Workspace Gmail instead of Supabase's rate-limited mailer.
//
// Secrets: SEND_EMAIL_HOOK_SECRET  the hook's secret shown by Supabase ("v1,whsec_…")
//          plus the Gmail ones the booking emails already use (GOOGLE_OAUTH_*, GMAIL_REFRESH_TOKEN, EMAIL_FROM).
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { sendEmail } from "../_shared/gmail.ts";
import { createAuthEmailHandler, type HookPayload } from "./handler.ts";

const secret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace(/^v1,whsec_/, "");
const webhook = new Webhook(secret);
const from = Deno.env.get("AUTH_EMAIL_FROM") || undefined;

Deno.serve(createAuthEmailHandler({
  verify: (body, headers) => webhook.verify(body, headers) as HookPayload,
  send: (email) => sendEmail(email, from),
}));

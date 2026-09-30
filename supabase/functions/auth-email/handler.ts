// Supabase Auth "Send Email" hook: Auth calls this instead of its own mailer, and the sign-in code goes out through
// the organisation's Workspace Gmail (see ../_shared/gmail.ts). Kept free of Deno.serve/env so it can be tested.
import type { Email } from "../_shared/gmail.ts";

export type HookPayload = {
  user: { email?: string; new_email?: string };
  email_data: { token?: string; email_action_type?: string };
};

export type Deps = {
  /** Checks Supabase's signature and returns the payload; throws if the request isn't from Supabase Auth. */
  verify(body: string, headers: Record<string, string>): HookPayload;
  send(email: Email): Promise<void>;
  log?: (...args: unknown[]) => void;
};

// Actions that sign someone in with a one-time code. Email changes and invites aren't used by this site, so they are
// refused rather than guessed at (members' sign-in email is managed by staff).
const CODE_ACTIONS = new Set(["signup", "magiclink", "reauthentication", "recovery"]);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The sign-in code email, in English and Greek. */
export function renderCodeEmail(code: string): Pick<Email, "subject" | "text" | "html"> {
  const c = escapeHtml(code);
  return {
    subject: `Your Active Zone Outdoor sign-in code: ${code}`,
    text: [
      `Your Active Zone Outdoor sign-in code is ${code}`,
      "Enter it on the sign-in page. It works once and expires soon.",
      "If you didn't ask for it, you can ignore this email.",
      "",
      `Ο κωδικός σύνδεσής σας στο Active Zone Outdoor είναι ${code}`,
      "Πληκτρολογήστε τον στη σελίδα σύνδεσης. Ισχύει μία φορά και λήγει σύντομα.",
      "Αν δεν τον ζητήσατε, αγνοήστε αυτό το μήνυμα.",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#16241f;max-width:480px">
<p>Your Active Zone Outdoor sign-in code:</p>
<p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:12px 0">${c}</p>
<p>Enter it on the sign-in page. It works once and expires soon. If you didn't ask for it, you can ignore this email.</p>
<hr style="border:0;border-top:1px solid #ddd;margin:20px 0">
<p>Ο κωδικός σύνδεσής σας στο Active Zone Outdoor: <b>${c}</b></p>
<p>Πληκτρολογήστε τον στη σελίδα σύνδεσης. Ισχύει μία φορά και λήγει σύντομα. Αν δεν τον ζητήσατε, αγνοήστε αυτό το μήνυμα.</p>
<p style="color:#888;font-size:12px">Active Zone Outdoor · Learning not confined within four walls</p>
</div>`,
  };
}

/** Supabase Auth expects {} on success and { error: { http_code, message } } otherwise. */
const reply = (status: number, message?: string) =>
  new Response(JSON.stringify(message ? { error: { http_code: status, message } } : {}), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export function createAuthEmailHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return reply(405, "Method not allowed");
    const body = await req.text();

    let payload: HookPayload;
    try {
      payload = deps.verify(body, Object.fromEntries(req.headers));
    } catch {
      return reply(401, "Invalid signature");
    }

    const action = payload.email_data?.email_action_type ?? "";
    const code = payload.email_data?.token ?? "";
    const to = payload.user?.email?.trim() ?? "";
    if (!CODE_ACTIONS.has(action)) return reply(400, `Email type "${action}" is not used by this site.`);
    if (!to || !/^\d{6,10}$/.test(code)) return reply(400, "Missing email address or code.");

    try {
      await deps.send({ to, ...renderCodeEmail(code) });
    } catch (err) {
      log("sending sign-in code failed", err);
      return reply(500, "The sign-in email could not be sent. Please try again in a moment.");
    }
    return reply(200);
  };
}

// Sends email through the Gmail API as a Workspace account (e.g. moments@activezoneoutdoor.cy), authorised
// once via OAuth with the gmail.send scope. Supabase Edge Functions can't use SMTP ports, so HTTPS it is.
import { accessToken } from "./drive.ts";

export type Email = { to: string; toName?: string; subject: string; text: string; html: string; replyTo?: string | null };

const encoder = new TextEncoder();

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** RFC 2047 encoding so names and subjects in any language survive email headers. */
function header(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64(encoder.encode(value))}?=`;
}

function address(email: string, name?: string): string {
  return name ? `${header(name.replace(/["\r\n]/g, ""))} <${email}>` : email;
}

function part(type: string, content: string): string {
  const body = base64(encoder.encode(content)).replace(/.{76}/g, "$&\r\n");
  return `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}\r\n`;
}

/** Builds the raw MIME message (plain text and HTML alternatives). */
export function buildMessage(email: Email, from: string): string {
  const boundary = `azo-${crypto.randomUUID()}`;
  const headers = [
    `From: ${from}`,
    `To: ${address(email.to, email.toName)}`,
    ...(email.replyTo ? [`Reply-To: ${email.replyTo}`] : []),
    `Subject: ${header(email.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  return `${headers.join("\r\n")}\r\n\r\n--${boundary}\r\n${part("text/plain", email.text)}--${boundary}\r\n${part("text/html", email.html)}--${boundary}--\r\n`;
}

export function emailFrom(): string {
  return Deno.env.get("EMAIL_FROM") ?? "AZO Moments <moments@activezoneoutdoor.cy>";
}

export async function sendEmail(email: Email): Promise<void> {
  // A dedicated sender account has its own token; otherwise the Drive account's token must include gmail.send.
  const secret = Deno.env.get("GMAIL_REFRESH_TOKEN") ? "GMAIL_REFRESH_TOKEN" : "GOOGLE_OAUTH_REFRESH_TOKEN";
  const raw = base64(encoder.encode(buildMessage(email, emailFrom()))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(secret)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
}

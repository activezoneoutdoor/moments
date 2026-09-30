import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildMessage, sendEmail } from "./gmail.ts";

function decodePart(message: string, type: string): string {
  const match = message.match(new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+)`));
  const bytes = Uint8Array.from(atob(match![1].replace(/\r\n/g, "")), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

Deno.test("messages carry UTF-8 names, subjects and bodies", () => {
  const message = buildMessage({
    to: "eleni@example.com", toName: "Ελένη", subject: "Κράτηση: Konnos ✓", text: "Γεια σου!", html: "<p>Γεια σου!</p>", replyTo: "leader@activezoneoutdoor.cy",
  }, "AZO Moments <moments@activezoneoutdoor.cy>");
  assertStringIncludes(message, "From: AZO Moments <moments@activezoneoutdoor.cy>\r\n");
  assertStringIncludes(message, "Reply-To: leader@activezoneoutdoor.cy\r\n");
  const subject = message.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)![1];
  assertEquals(new TextDecoder().decode(Uint8Array.from(atob(subject), (c) => c.charCodeAt(0))), "Κράτηση: Konnos ✓");
  assertStringIncludes(message, "To: =?UTF-8?B?");
  assertEquals(decodePart(message, "text/plain"), "Γεια σου!");
  assertEquals(decodePart(message, "text/html"), "<p>Γεια σου!</p>");
});

Deno.test("a dedicated sender account's token is used for Gmail", async () => {
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
  Deno.env.set("GOOGLE_OAUTH_REFRESH_TOKEN", "drive-refresh");
  Deno.env.set("GMAIL_REFRESH_TOKEN", "gmail-refresh");

  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") {
      const refresh = new URLSearchParams(String(init?.body)).get("refresh_token");
      calls.push(`token for ${refresh}`);
      return Promise.resolve(Response.json({ access_token: `access-for-${refresh}`, expires_in: 3600 }));
    }
    calls.push(`${url.pathname} with ${new Headers(init?.headers).get("Authorization")} raw=${typeof JSON.parse(String(init?.body)).raw}`);
    return Promise.resolve(Response.json({ id: "m1" }));
  };
  try {
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" });
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("GMAIL_REFRESH_TOKEN");
  }
  assertEquals(calls, ["token for gmail-refresh", "/gmail/v1/users/me/messages/send with Bearer access-for-gmail-refresh raw=string"]);
});

Deno.test("visitor input in the subject or reply-to can't add headers", () => {
  const message = buildMessage({
    to: "team@activezoneoutdoor.cy", subject: "Hi\r\nBcc: victim@example.com", text: "x", html: "x",
    replyTo: "a@b.co\r\nBcc: victim@example.com",
  }, "Active Zone Outdoor website <moments@activezoneoutdoor.cy>");
  const headers = message.split("\r\n\r\n")[0];
  assertEquals(/^Bcc:/m.test(headers), false, headers);
});

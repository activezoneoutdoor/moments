import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Webhook } from "npm:standardwebhooks@1.0.0";
import type { Email } from "../_shared/gmail.ts";
import { createAuthEmailHandler, type HookPayload, renderCodeEmail } from "./handler.ts";

const secret = btoa("test-secret-for-the-send-email-hook");
const webhook = new Webhook(secret);

function setup(send?: (e: Email) => Promise<void>) {
  const sent: Email[] = [];
  const handler = createAuthEmailHandler({
    verify: (body, headers) => webhook.verify(body, headers) as HookPayload,
    send: send ?? ((e) => { sent.push(e); return Promise.resolve(); }),
    log: () => {},
  });
  return { handler, sent };
}

/** A request signed like Supabase Auth signs it. */
function signed(payload: unknown, sign = webhook): Request {
  const body = JSON.stringify(payload);
  const id = `msg_${crypto.randomUUID()}`;
  const now = new Date();
  return new Request("http://localhost/auth-email", {
    method: "POST",
    headers: {
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": sign.sign(id, now, body),
      "content-type": "application/json",
    },
    body,
  });
}

const payload = (action: string, token = "123456", email = "maria@gmail.com") => ({
  user: { email },
  email_data: { token, email_action_type: action, token_hash: "h", redirect_to: "", site_url: "" },
});

Deno.test("sends the code for sign-in and sign-up", async () => {
  for (const action of ["magiclink", "signup"]) {
    const { handler, sent } = setup();
    const res = await handler(signed(payload(action)));
    assertEquals(res.status, 200, action);
    assertEquals(await res.json(), {});
    assertEquals(sent.length, 1);
    assertEquals(sent[0].to, "maria@gmail.com");
    assertStringIncludes(sent[0].subject, "123456");
    assertStringIncludes(sent[0].text, "123456");
  }
});

Deno.test("rejects requests not signed by Supabase", async () => {
  const { handler, sent } = setup();
  const res = await handler(signed(payload("magiclink"), new Webhook(btoa("someone-else's-secret-value!!"))));
  assertEquals(res.status, 401);
  const unsigned = await handler(
    new Request("http://localhost/", { method: "POST", body: JSON.stringify(payload("magiclink")) }),
  );
  assertEquals(unsigned.status, 401);
  assertEquals(sent.length, 0);
});

Deno.test("refuses email types the site doesn't use", async () => {
  for (const action of ["email_change", "invite", ""]) {
    const { handler, sent } = setup();
    const res = await handler(signed(payload(action)));
    assertEquals(res.status, 400, action);
    const body = await res.json();
    assertEquals(body.error.http_code, 400);
    assertEquals(sent.length, 0);
  }
});

Deno.test("refuses a missing address or a code that isn't digits", async () => {
  for (const p of [payload("magiclink", "123456", ""), payload("magiclink", "<b>1</b>")]) {
    const { handler, sent } = setup();
    assertEquals((await handler(signed(p))).status, 400);
    assertEquals(sent.length, 0);
  }
});

Deno.test("a Gmail failure is reported to Supabase Auth", async () => {
  const { handler } = setup(() => Promise.reject(new Error("gmail down")));
  const res = await handler(signed(payload("magiclink")));
  assertEquals(res.status, 500);
  assert((await res.json()).error.message.includes("could not be sent"));
});

Deno.test("the email is bilingual", () => {
  const email = renderCodeEmail("654321");
  assertStringIncludes(email.html, "654321");
  assertStringIncludes(email.text, "Ο κωδικός σύνδεσής σας");
});

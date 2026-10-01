import { assertEquals } from "@std/assert";
import { handleJson, HttpError, originMatches } from "./http.ts";

const post = (body: unknown) => new Request("http://fn/", { method: "POST", body: JSON.stringify(body) });

Deno.test("preflight is answered with open CORS", async () => {
  const res = await handleJson(() => Promise.resolve({}))(new Request("http://fn/", { method: "OPTIONS", headers: { Origin: "https://example.org" } }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("an HttpError becomes a readable JSON error with CORS headers", async () => {
  const res = await handleJson(() => Promise.reject(new HttpError(403, "Not allowed.")))(post({}));
  assertEquals(res.status, 403);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await res.json(), { error: "Not allowed." });
});

Deno.test("an unexpected error becomes a generic 500", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const res = await handleJson(() => Promise.reject(new Error("boom")))(post({}));
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: "Something went wrong. Please try again." });
  } finally {
    console.error = quiet;
  }
});

Deno.test("the handler's result is returned as JSON", async () => {
  const res = await handleJson((_req, body) => Promise.resolve({ echo: body.name }))(post({ name: "Maria" }));
  assertEquals(await res.json(), { echo: "Maria" });
});

Deno.test("a handler may answer with its own Response, which gets CORS headers", async () => {
  const res = await handleJson(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } })))(post({}));
  assertEquals(res.headers.get("Content-Type"), "image/jpeg");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(new Uint8Array(await res.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

Deno.test("staff-only functions return the real error message", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const dbError = { message: 'column events.cover_drive_file_id does not exist', code: "42703" };
    const res = await handleJson(() => Promise.reject(dbError), { exposeErrors: true })(post({}));
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: "Server error: column events.cover_drive_file_id does not exist" });
  } finally {
    console.error = quiet;
  }
});

Deno.test("origins match exactly, or any one subdomain of a wildcard entry", () => {
  const allowed = ["https://www2.activezoneoutdoor.cy", "https://*.azo-moments.pages.dev"];
  assertEquals(originMatches("https://www2.activezoneoutdoor.cy", allowed), true);
  assertEquals(originMatches("https://pr-24.azo-moments.pages.dev", allowed), true);
  assertEquals(originMatches("https://3f2a1b9c.azo-moments.pages.dev", allowed), true);
  assertEquals(originMatches("https://azo-moments.pages.dev", allowed), false);
  assertEquals(originMatches("https://a.b.azo-moments.pages.dev", allowed), false);
  assertEquals(originMatches("https://evil-azo-moments.pages.dev", allowed), false);
  assertEquals(originMatches("http://pr-24.azo-moments.pages.dev", allowed), false);
  assertEquals(originMatches("https://www.activezoneoutdoor.cy", allowed), false);
  assertEquals(originMatches(null, allowed), false);
});

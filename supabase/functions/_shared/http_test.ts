import { assertEquals } from "@std/assert";
import { handleJson, HttpError } from "./http.ts";

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

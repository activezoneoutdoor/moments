import { assertEquals, assertRejects } from "@std/assert";
import { accessToken, eventFolderName, findOrCreateFolder, getThumbnail } from "./drive.ts";

Deno.test("event folder uses the Cyprus date, activity and location", () => {
  assertEquals(
    eventFolderName({ starts_at: "2026-09-26T22:30:00Z", activity: "SUP", location_name: "Ayia Napa" }),
    "2026-09-27_SUP_Ayia-Napa",
  );
});

Deno.test("event folder strips accents and punctuation", () => {
  assertEquals(
    eventFolderName({ starts_at: "2026-10-04T06:00:00Z", activity: "Hiking / Trail", location_name: "Kakopetria, Troödos" }),
    "2026-10-04_Hiking-Trail_Kakopetria-Troodos",
  );
});

Deno.test("access token comes from the stored refresh token and is cached", async () => {
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
  Deno.env.set("GOOGLE_OAUTH_REFRESH_TOKEN", "refresh-token");

  const realFetch = globalThis.fetch;
  const requests: URLSearchParams[] = [];
  globalThis.fetch = (_input, init) => {
    requests.push(new URLSearchParams(String(init?.body)));
    return Promise.resolve(Response.json({ access_token: "access-1", expires_in: 3599 }));
  };
  try {
    assertEquals(await accessToken(), "access-1");
    assertEquals(await accessToken(), "access-1");
  } finally {
    globalThis.fetch = realFetch;
  }

  assertEquals(requests.length, 1);
  assertEquals(requests[0].get("grant_type"), "refresh_token");
  assertEquals(requests[0].get("client_id"), "client-id");
  assertEquals(requests[0].get("refresh_token"), "refresh-token");
});

Deno.test("a folder created at the same moment as another is trashed in favour of the oldest", async () => {
  Deno.env.set("AZO_SHARED_DRIVE_ID", "shared-drive");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
  Deno.env.set("GOOGLE_OAUTH_REFRESH_TOKEN", "refresh-token");

  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  let lists = 0;
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}${method === "PATCH" ? ` ${init?.body}` : ""}`);
    if (url.hostname === "oauth2.googleapis.com") return Promise.resolve(Response.json({ access_token: "a", expires_in: 3600 }));
    if (method === "POST") return Promise.resolve(Response.json({ id: "ours" }));
    if (method === "PATCH") return Promise.resolve(Response.json({ id: "ours" }));
    // First lookup finds nothing; after creating, another request's folder turns out to be older.
    return Promise.resolve(Response.json({ files: lists++ === 0 ? [] : [{ id: "theirs" }, { id: "ours" }] }));
  };
  try {
    assertEquals(await findOrCreateFolder("2026-09-27_SUP_Ayia-Napa", "year-folder"), "theirs");
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(calls.filter((c) => !c.includes("/token")), [
    "GET /drive/v3/files",
    "POST /drive/v3/files",
    "GET /drive/v3/files",
    'PATCH /drive/v3/files/ours {"trashed":true}',
  ]);
});

Deno.test("a folder is never created without its parent when Drive can't find the Shared Drive", async () => {
  Deno.env.set("AZO_SHARED_DRIVE_ID", "shared-drive");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
  Deno.env.set("GOOGLE_OAUTH_REFRESH_TOKEN", "refresh-token");

  const realFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") return Promise.resolve(Response.json({ access_token: "a", expires_in: 3600 }));
    methods.push(init?.method ?? "GET");
    return Promise.resolve(Response.json({ error: { code: 404, message: "Shared drive not found: shared-drive" } }, { status: 404 }));
  };
  try {
    await assertRejects(() => findOrCreateFolder("2026", "shared-drive"), Error, "404");
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(methods, ["GET"]);
});

Deno.test("thumbnails are fetched through the app's Drive access at the requested size", async () => {
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
  Deno.env.set("GOOGLE_OAUTH_REFRESH_TOKEN", "refresh-token");

  const realFetch = globalThis.fetch;
  const imageRequests: { url: string; auth: string | null }[] = [];
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") return Promise.resolve(Response.json({ access_token: "a", expires_in: 3600 }));
    if (url.hostname === "www.googleapis.com") return Promise.resolve(Response.json({ thumbnailLink: "https://lh3.googleusercontent.com/drive-storage/abc=s220" }));
    imageRequests.push({ url: String(input), auth: new Headers(init?.headers).get("Authorization")?.startsWith("Bearer ") ? "Bearer <token>" : null });
    return Promise.resolve(new Response(new Uint8Array([9]), { headers: { "Content-Type": "image/png" } }));
  };
  try {
    const thumb = await getThumbnail("file-1", 480);
    assertEquals(thumb?.type, "image/png");
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(imageRequests, [{ url: "https://lh3.googleusercontent.com/drive-storage/abc=s480", auth: "Bearer <token>" }]);
});

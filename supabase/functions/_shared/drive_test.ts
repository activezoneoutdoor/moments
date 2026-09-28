import { assertEquals } from "@std/assert";
import { accessToken, eventFolderName } from "./drive.ts";

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

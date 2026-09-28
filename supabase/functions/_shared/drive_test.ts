import { assertEquals } from "@std/assert";
import { eventFolderName } from "./drive.ts";

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

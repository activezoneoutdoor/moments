import { assertEquals } from "@std/assert";
import { planSync } from "./sync.ts";

const rows = [
  { id: "r1", drive_file_id: "f1", name: "Maria - IMG_1.jpg" },
  { id: "r2", drive_file_id: "f2", name: "IMG_2.jpg" },
  { id: "r3", drive_file_id: "f3", name: "old name.jpg" },
];

Deno.test("files added in Drive are imported for review, credited to whoever added them", () => {
  const plan = planSync(rows, [
    { id: "f1", name: "Maria - IMG_1.jpg", mimeType: "image/jpeg" },
    { id: "f2", name: "IMG_2.jpg", mimeType: "image/jpeg" },
    { id: "f3", name: "old name.jpg", mimeType: "image/jpeg" },
    { id: "f4", name: "GOPR0001.MP4", mimeType: "video/mp4", size: "1024", lastModifyingUser: { displayName: "Andreas" } },
  ], null);
  assertEquals(plan.insert, [
    { drive_file_id: "f4", name: "GOPR0001.MP4", mime_type: "video/mp4", size: 1024, uploader_name: "Andreas", source: "drive" },
  ]);
  assertEquals(plan.remove, []);
  assertEquals(plan.rename, []);
});

Deno.test("files deleted in Drive leave the album and renames are picked up", () => {
  const plan = planSync(rows, [
    { id: "f1", name: "Maria - IMG_1.jpg", mimeType: "image/jpeg" },
    { id: "f3", name: "sunset.jpg", mimeType: "image/jpeg" },
  ], null);
  assertEquals(plan.insert, []);
  assertEquals(plan.remove, ["r2"]);
  assertEquals(plan.rename, [{ id: "r3", name: "sunset.jpg" }]);
});

Deno.test("the event photo is never imported into the album", () => {
  const plan = planSync([], [
    { id: "cover", name: "_event-photo.jpg", mimeType: "image/jpeg" },
    { id: "other-cover", name: "renamed-cover.jpg", mimeType: "image/jpeg" },
  ], "other-cover");
  assertEquals(plan.insert, []);
});

Deno.test("a participant upload seen before upload-finish keeps its uploader and source", () => {
  const plan = planSync([], [
    { id: "f9", name: "Eleni - IMG_9.jpg", mimeType: "image/jpeg", appProperties: { azo: "upload", uploader: "Eleni" }, lastModifyingUser: { displayName: "AZO Albums" } },
    { id: "f10", name: "IMG_10.jpg", mimeType: "image/jpeg", appProperties: { azo: "upload" }, lastModifyingUser: { displayName: "AZO Albums" } },
  ], null);
  assertEquals(plan.insert.map((m) => [m.uploader_name, m.source]), [["Eleni", "upload"], [null, "upload"]]);
});

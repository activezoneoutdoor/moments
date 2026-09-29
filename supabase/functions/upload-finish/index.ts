// Public: records a finished participant upload so staff can review it.
import { admin, eventForUploadToken } from "../_shared/db.ts";
import { getFile } from "../_shared/drive.ts";
import { HttpError, requireString, serveJson } from "../_shared/http.ts";

serveJson(async (_req, body) => {
  const event = await eventForUploadToken(requireString(body, "token", 100));
  const fileId = requireString(body, "fileId", 200);
  const uploaderName = typeof body.uploaderName === "string" ? body.uploaderName.trim().slice(0, 80) : null;

  const file = await getFile(fileId);
  if (!file || !event.drive_folder_id || !file.parents?.includes(event.drive_folder_id)) {
    throw new HttpError(404, "Upload not found for this event.");
  }

  const { error } = await admin().from("media").upsert({
    event_id: event.id,
    drive_file_id: file.id,
    name: file.name,
    mime_type: file.mimeType,
    size: file.size ? Number(file.size) : null,
    uploader_name: uploaderName || null,
    source: "upload",
    // A Drive sync may have recorded the file first; keep its review status but take the uploader's details.
  }, { onConflict: "drive_file_id" });
  if (error) throw error;

  if (event.album_status === "none") {
    await admin().from("events").update({ album_status: "collecting" }).eq("id", event.id).eq("album_status", "none");
  }
  return { ok: true };
});

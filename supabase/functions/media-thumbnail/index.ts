// Staff only: returns the preview image of an uploaded photo or video for the review grid.
import { admin, requireStaff } from "../_shared/db.ts";
import { getThumbnail } from "../_shared/drive.ts";
import { HttpError, requireString, serveJson } from "../_shared/http.ts";

serveJson(async (req, body) => {
  await requireStaff(req);
  const size = Math.min(Math.max(Number(body.size) || 480, 120), 1600);

  const { data: media, error } = await admin().from("media").select("drive_file_id").eq("id", requireString(body, "mediaId", 100)).maybeSingle();
  if (error) throw error;
  if (!media) throw new HttpError(404, "Media not found.");

  const thumbnail = await getThumbnail(media.drive_file_id, size);
  if (!thumbnail) throw new HttpError(404, "No preview available yet.");

  return new Response(thumbnail.bytes, {
    headers: { "Content-Type": thumbnail.type, "Cache-Control": "private, max-age=3600" },
  });
});

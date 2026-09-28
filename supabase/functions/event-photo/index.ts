// Staff only: manages an event's photo, stored as a file in the event's Drive folder and shared by link
// (it shows on upcoming events, before any album is published). It is not part of the album's media.
//   set      { image: base64 JPEG }  saves a new photo, replacing any previous one or album photo
//   remove   { albumMediaId? }       removes the photo; with albumMediaId that album photo is used instead
//   share / unshare                  turns link sharing on or off (restoring / archiving the event)
import { admin, eventById, requireStaff } from "../_shared/db.ts";
import { ensureEventFolder, setPublicLink, trash, uploadSmallFile } from "../_shared/drive.ts";
import { HttpError, requireString, serveJson } from "../_shared/http.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const FILE_NAME = "_event-photo.jpg";

function decodeImage(base64: string): Uint8Array<ArrayBuffer> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, "The photo could not be read.");
  }
  if (bytes.length > MAX_BYTES) throw new HttpError(413, "The photo is too large.");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new HttpError(415, "The photo must be a JPEG.");
  return bytes;
}

serveJson(async (req, body) => {
  await requireStaff(req);
  const event = await eventById(requireString(body, "eventId", 100));
  const action = requireString(body, "action", 20);

  const { data: row, error } = await admin().from("events").select("cover_drive_file_id").eq("id", event.id).single();
  if (error) throw error;
  const current: string | null = row.cover_drive_file_id;

  const update = async (values: Record<string, unknown>) => {
    const { error: updateError } = await admin().from("events").update(values).eq("id", event.id);
    if (updateError) throw updateError;
  };

  switch (action) {
    case "set": {
      if (event.status === "archived") throw new HttpError(409, "Restore the event before changing its photo.");
      const bytes = decodeImage(requireString(body, "image", 8 * 1024 * 1024));
      const folderId = await ensureEventFolder(event);
      const fileId = await uploadSmallFile(folderId, FILE_NAME, "image/jpeg", bytes);
      await setPublicLink(fileId, true);
      await update({ cover_drive_file_id: fileId, cover_media_id: null });
      if (current) await trash(current);
      return { coverDriveFileId: fileId };
    }
    case "remove": {
      const albumMediaId = typeof body.albumMediaId === "string" ? body.albumMediaId : null;
      await update({ cover_drive_file_id: null, cover_media_id: albumMediaId });
      if (current) await trash(current);
      return { coverDriveFileId: null };
    }
    case "share":
    case "unshare":
      if (current) await setPublicLink(current, action === "share");
      return { coverDriveFileId: current };
    default:
      throw new HttpError(400, "Unknown action.");
  }
});

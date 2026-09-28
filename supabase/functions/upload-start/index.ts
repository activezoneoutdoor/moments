// Public: a participant with the event's upload link asks to upload one file.
// Returns a Google Drive resumable upload URL; the browser sends the bytes straight to Drive.
import { eventForUploadToken } from "../_shared/db.ts";
import { ensureEventFolder, startResumableUpload } from "../_shared/drive.ts";
import { HttpError, isAllowedOrigin, requireString, serveJson } from "../_shared/http.ts";

const MAX_BYTES = 2 * 1024 ** 3;

serveJson(async (req, body) => {
  const origin = req.headers.get("Origin");
  // Drive binds the upload session to the browser's origin, so only our own site can use it.
  if (!isAllowedOrigin(origin)) {
    throw new HttpError(403, `This website (${origin ?? "unknown origin"}) isn't allowed to upload. Add it to the ALLOWED_ORIGINS secret.`);
  }

  const event = await eventForUploadToken(requireString(body, "token", 100));
  const filename = requireString(body, "filename", 250).replace(/[\\/]/g, "_");
  const mimeType = requireString(body, "mimeType", 100).toLowerCase();
  const size = Number(body.size);
  const uploaderName = typeof body.uploaderName === "string" ? body.uploaderName.trim().slice(0, 80) : "";

  if (!/^(image|video)\//.test(mimeType)) throw new HttpError(415, "Only photos and videos can be uploaded.");
  if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, "Missing or invalid size.");
  if (size > MAX_BYTES) throw new HttpError(413, "Files must be 2 GB or smaller.");

  const folderId = await ensureEventFolder(event);
  const uploadUrl = await startResumableUpload({
    folderId,
    name: uploaderName ? `${uploaderName} - ${filename}` : filename,
    mimeType,
    size,
    origin,
    description: uploaderName ? `Uploaded by ${uploaderName}` : undefined,
  });
  return { uploadUrl };
});

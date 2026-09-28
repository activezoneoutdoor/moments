import type { SupabaseClient } from "@supabase/supabase-js";
import { callFunction } from "@/lib/events";

// Google requires chunks in multiples of 256 KiB.
const CHUNK_SIZE = 32 * 256 * 1024;
const MAX_RETRIES = 5;

type DriveFile = { id: string };

const typesByExtension: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", "3gp": "video/3gpp", webm: "video/webm",
};

/** The file's media type; some phones leave `File.type` empty for HEIC photos and MOV videos. */
export function mediaType(file: File): string {
  return file.type || typesByExtension[file.name.split(".").pop()?.toLowerCase() ?? ""] || "";
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Reads how many bytes Google has from a 308 response, when the Range header is visible. */
function receivedBytes(res: Response): number | null {
  const range = res.headers.get("Range");
  const match = range?.match(/bytes=0-(\d+)/);
  return match ? Number(match[1]) + 1 : null;
}

async function queryOffset(uploadUrl: string, size: number): Promise<number | DriveFile> {
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes */${size}` } });
  if (res.ok) return res.json();
  if (res.status === 308) return receivedBytes(res) ?? 0;
  throw new Error(`Upload could not resume (${res.status}).`);
}

/**
 * Uploads a photo or video to the event's Google Drive folder through a resumable session,
 * sending chunks straight from the browser to Google, then records it for staff review.
 */
export async function uploadToEvent(
  supabase: SupabaseClient,
  token: string,
  file: File,
  uploaderName: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const mimeType = mediaType(file);
  const { uploadUrl } = await callFunction<{ uploadUrl: string }>(supabase, "upload-start", {
    token, filename: file.name, mimeType, size: file.size, uploaderName,
  });

  let offset = 0;
  let retries = 0;
  let driveFile: DriveFile | null = null;

  while (!driveFile) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    try {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
        body: file.slice(offset, end),
      });

      if (res.ok) {
        driveFile = await res.json();
      } else if (res.status === 308) {
        offset = receivedBytes(res) ?? end;
        retries = 0;
      } else if (res.status >= 500 || res.status === 429) {
        throw new Error(`Google responded ${res.status}`);
      } else {
        throw Object.assign(new Error(`Upload was rejected (${res.status}).`), { fatal: true });
      }
    } catch (error) {
      if ((error as { fatal?: boolean }).fatal || ++retries > MAX_RETRIES) throw error;
      await wait(1000 * 2 ** retries);
      const state = await queryOffset(uploadUrl, file.size).catch(() => offset);
      if (typeof state === "number") offset = state;
      else driveFile = state;
    }
    onProgress(driveFile ? 1 : offset / file.size);
  }

  await callFunction(supabase, "upload-finish", { token, fileId: driveFile.id, uploaderName });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { callFunction, driveThumbnail, type AzoEvent } from "@/lib/events";

const MAX_SIDE = 1920;

/** Scales a photo down to at most 1920px on its longest side and re-encodes it as JPEG. */
export async function resizeImage(file: File, maxSide = MAX_SIDE): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This browser can't read that image. Please choose a JPEG or PNG photo.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not prepare the photo.")),
    "image/jpeg",
    0.85,
  ));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(binary);
}

/** Saves a staff-chosen event photo (already resized) in the event's Drive folder; it replaces any previous photo. */
export async function uploadEventCover(supabase: SupabaseClient, event: Pick<AzoEvent, "id">, blob: Blob): Promise<void> {
  const image = toBase64(new Uint8Array(await blob.arrayBuffer()));
  await callFunction(supabase, "event-photo", { eventId: event.id, action: "set", image });
}

/** Removes the event photo. With `albumMediaId`, that album photo becomes the event photo instead. */
export async function clearEventCover(supabase: SupabaseClient, event: Pick<AzoEvent, "id">, albumMediaId: string | null = null): Promise<void> {
  await callFunction(supabase, "event-photo", { eventId: event.id, action: "remove", albumMediaId });
}

/** Turns link sharing of the event photo off when archiving and back on when restoring. */
export async function setEventPhotoShared(supabase: SupabaseClient, event: Pick<AzoEvent, "id">, shared: boolean): Promise<void> {
  await callFunction(supabase, "event-photo", { eventId: event.id, action: shared ? "share" : "unshare" });
}

/**
 * The event photo at the requested width: the photo saved in Drive (always shared by link), else the chosen
 * album photo when its Drive file ID is known (public once the album is published), else none.
 */
export function eventCoverUrl(
  event: Pick<AzoEvent, "cover_drive_file_id">,
  albumCoverDriveFileId?: string | null,
  width = 1200,
): string | null {
  const fileId = event.cover_drive_file_id ?? albumCoverDriveFileId;
  return fileId ? driveThumbnail(fileId, width) : null;
}

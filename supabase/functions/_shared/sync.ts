// Keeps an event's album records in step with its Drive folder. Drive decides which files exist;
// the app decides what is approved and published.
import { admin, type EventRow } from "./db.ts";
import {
  type DriveMediaFile,
  eventFolderName,
  findFolder,
  findOrCreateFolder,
  getFolderInfo,
  listFolderMedia,
  moveAndRename,
  sharedDriveId,
} from "./drive.ts";

export const EVENT_PHOTO_NAME = "_event-photo.jpg";

type MediaRow = { id: string; drive_file_id: string; name: string };

export type NewMedia = {
  drive_file_id: string;
  name: string;
  mime_type: string;
  size: number | null;
  uploader_name: string | null;
  source: "upload" | "drive";
};

export type SyncPlan = { insert: NewMedia[]; remove: string[]; rename: { id: string; name: string }[] };

/** Compares the album's records with the files in Drive. Pure, so it can be tested without Drive. */
export function planSync(rows: MediaRow[], files: DriveMediaFile[], coverDriveFileId: string | null): SyncPlan {
  const albumFiles = files.filter((file) => file.id !== coverDriveFileId && file.name !== EVENT_PHOTO_NAME);
  const byFileId = new Map(albumFiles.map((file) => [file.id, file]));
  const known = new Set(rows.map((row) => row.drive_file_id));

  const insert = albumFiles.filter((file) => !known.has(file.id)).map((file): NewMedia => {
    const fromUpload = file.appProperties?.azo === "upload";
    return {
      drive_file_id: file.id,
      name: file.name,
      mime_type: file.mimeType,
      size: file.size ? Number(file.size) : null,
      uploader_name: file.appProperties?.uploader ?? (fromUpload ? null : file.lastModifyingUser?.displayName ?? null),
      source: fromUpload ? "upload" : "drive",
    };
  });
  const remove = rows.filter((row) => !byFileId.has(row.drive_file_id)).map((row) => row.id);
  const rename = rows
    .filter((row) => byFileId.has(row.drive_file_id) && byFileId.get(row.drive_file_id)!.name !== row.name)
    .map((row) => ({ id: row.id, name: byFileId.get(row.drive_file_id)!.name }));

  return { insert, remove, rename };
}

export type SyncSummary = {
  added: number;
  removed: number;
  renamed: number;
  folderAdopted: boolean;
  folderRenamed: boolean;
  warning: string | null;
};

const FOLDER_GONE =
  "The event's Drive folder was deleted or moved to the trash, so nothing was changed. Restore it from Drive's trash to keep this album.";

/** Brings the event's album records in line with its Drive folder. */
export async function syncEvent(event: EventRow): Promise<SyncSummary> {
  const summary: SyncSummary = { added: 0, removed: 0, renamed: 0, folderAdopted: false, folderRenamed: false, warning: null };
  const db = admin();
  const expectedName = eventFolderName(event);
  let folderId = event.drive_folder_id;

  // No folder yet: link one that already has the generated name, without creating anything.
  if (!folderId) {
    const yearFolder = await findFolder(expectedName.slice(0, 4), sharedDriveId());
    const found = yearFolder ? await findFolder(expectedName, yearFolder) : null;
    if (!found) return summary;
    const { data, error } = await db.from("events").update({ drive_folder_id: found }).eq("id", event.id).is("drive_folder_id", null)
      .select("drive_folder_id").maybeSingle();
    if (error) throw error;
    folderId = data?.drive_folder_id ?? found;
    summary.folderAdopted = !!data;
  }

  if (!folderId) return summary;

  // A deleted or trashed folder would look like every file was removed; never wipe the album for that.
  const folder = await getFolderInfo(folderId);
  if (folder.state !== "ok") return { ...summary, warning: FOLDER_GONE };

  // Keep the folder's name and year in line with the event's date, activity and location.
  const yearFolder = await findOrCreateFolder(expectedName.slice(0, 4), sharedDriveId());
  const currentParent = folder.parents?.[0];
  if (folder.name !== expectedName || currentParent !== yearFolder) {
    try {
      await moveAndRename(folderId, expectedName, yearFolder, currentParent);
      summary.folderRenamed = true;
    } catch (error) {
      // Drive refuses some moves (e.g. from someone's My Drive into the Shared Drive); keep syncing the files.
      summary.warning = `The Drive folder could not be renamed to "${expectedName}": ${error instanceof Error ? error.message : error}`;
    }
  }

  const [{ data: rows, error: rowsError }, { data: eventRow, error: eventError }, files] = await Promise.all([
    db.from("media").select("id, drive_file_id, name").eq("event_id", event.id),
    db.from("events").select("cover_drive_file_id").eq("id", event.id).single(),
    listFolderMedia(folderId),
  ]);
  if (rowsError) throw rowsError;
  if (eventError) throw eventError;

  const coverId: string | null = eventRow.cover_drive_file_id;
  const plan = planSync(rows ?? [], files, coverId);

  if (plan.insert.length) {
    const { error } = await db.from("media").upsert(
      plan.insert.map((item) => ({ ...item, event_id: event.id })),
      { onConflict: "drive_file_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  if (plan.remove.length) {
    const { error } = await db.from("media").delete().in("id", plan.remove);
    if (error) throw error;
  }
  for (const item of plan.rename) {
    const { error } = await db.from("media").update({ name: item.name }).eq("id", item.id);
    if (error) throw error;
  }

  // The event photo lives in the folder too; forget it if someone deleted it there.
  if (coverId && !files.some((file) => file.id === coverId)) {
    const photo = await getFolderInfo(coverId);
    if (photo.state !== "ok") await db.from("events").update({ cover_drive_file_id: null }).eq("id", event.id);
  }

  const hasMedia = (rows?.length ?? 0) - plan.remove.length + plan.insert.length > 0;
  if (hasMedia && event.album_status === "none") {
    await db.from("events").update({ album_status: "collecting" }).eq("id", event.id).eq("album_status", "none");
  }

  return { ...summary, added: plan.insert.length, removed: plan.remove.length, renamed: plan.rename.length };
}

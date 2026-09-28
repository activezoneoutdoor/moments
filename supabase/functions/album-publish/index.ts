// Staff only: publishes an event album (or takes it down) and syncs Drive link sharing,
// so only approved files of published albums are viewable by the public.
import { admin, eventById, requireStaff } from "../_shared/db.ts";
import { setPublicLink } from "../_shared/drive.ts";
import { HttpError, requireString, serveJson } from "../_shared/http.ts";

const CONCURRENCY = 8;

async function inBatches<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(task));
  }
}

serveJson(async (req, body) => {
  await requireStaff(req);
  const event = await eventById(requireString(body, "eventId", 100));
  const publish = body.publish === true;
  if (publish && event.status === "archived") throw new HttpError(409, "Restore the event before publishing its album.");

  const { data: media, error } = await admin().from("media").select("drive_file_id, status").eq("event_id", event.id);
  if (error) throw error;

  await inBatches(media ?? [], (item) => setPublicLink(item.drive_file_id, publish && item.status === "approved"));

  const albumStatus = publish ? "published" : (media?.length ? "collecting" : "none");
  const { error: updateError } = await admin().from("events").update({ album_status: albumStatus }).eq("id", event.id);
  if (updateError) throw updateError;

  return { albumStatus, shared: publish ? (media ?? []).filter((item) => item.status === "approved").length : 0 };
});

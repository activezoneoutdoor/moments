// Staff only: brings an event's album in line with its Drive folder (files added, removed or renamed there).
import { eventById, requireStaff } from "../_shared/db.ts";
import { requireString, serveJson } from "../_shared/http.ts";
import { syncEvent } from "../_shared/sync.ts";

serveJson(async (req, body) => {
  await requireStaff(req);
  return await syncEvent(await eventById(requireString(body, "eventId", 100)));
}, { exposeErrors: true });

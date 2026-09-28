import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  activity: string;
  starts_at: string;
  location_name: string;
  album_status: "none" | "collecting" | "published";
  drive_folder_id: string | null;
};

const eventColumns = "id, slug, title, activity, starts_at, location_name, album_status, drive_folder_id";

let adminClient: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS, so only use it after checking the caller. */
export function admin(): SupabaseClient {
  adminClient ??= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Resolves a participant upload token to its event, rejecting closed or expired links. */
export async function eventForUploadToken(token: string): Promise<EventRow> {
  const { data, error } = await admin()
    .from("event_upload_links")
    .select(`open, expires_at, events (${eventColumns})`)
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;

  const event = data?.events as unknown as EventRow | null;
  if (!data || !event) throw new HttpError(404, "This upload link is not valid.");
  if (!data.open || (data.expires_at && new Date(data.expires_at) < new Date())) {
    throw new HttpError(410, "This upload link is closed. Ask the event leader for a new one.");
  }
  return event;
}

export async function eventById(id: string): Promise<EventRow> {
  const { data, error } = await admin().from("events").select(eventColumns).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Event not found.");
  return data as EventRow;
}

/** Checks the caller's Supabase session belongs to an Active Zone Outdoor staff account. */
export async function requireStaff(req: Request): Promise<void> {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data, error } = await admin().auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase() ?? "";
  if (error || !email.endsWith("@activezoneoutdoor.cy")) {
    throw new HttpError(403, "Only Active Zone Outdoor staff can do this.");
  }
}

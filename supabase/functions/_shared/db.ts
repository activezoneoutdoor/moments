import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  activity: string;
  starts_at: string;
  location_name: string;
  status: "draft" | "published" | "cancelled" | "archived";
  album_status: "none" | "collecting" | "published";
  drive_folder_id: string | null;
};

const eventColumns = "id, slug, title, activity, starts_at, location_name, status, album_status, drive_folder_id";

let adminClient: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS, so only use it after checking the caller. */
export function admin(): SupabaseClient {
  adminClient ??= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Look fetch up on each request (supabase-js otherwise keeps the one it saw first), so tests can fake it.
    global: { fetch: (...args) => fetch(...args) },
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
  if (!data.open || event.status === "archived" || (data.expires_at && new Date(data.expires_at) < new Date())) {
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

export type Role = "admin" | "staff" | "leader";

/**
 * The caller's email and team role, from their Supabase session and the staff_roles table. Access comes only
 * from that table (see the roles migration), so someone removed from the team is refused on their next request.
 */
export async function callerRole(req: Request): Promise<{ email: string; role: Role | null }> {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data, error } = await admin().auth.getUser(jwt);
  const email = data.user?.email?.trim().toLowerCase() ?? "";
  if (error || !email) return { email: "", role: null };

  const { data: row, error: roleError } = await admin().from("staff_roles").select("role").eq("email", email).maybeSingle();
  if (roleError) throw roleError;
  return { email, role: (row?.role as Role | undefined) ?? null };
}

/** Checks the caller is Active Zone Outdoor staff (admin or staff role). */
export async function requireStaff(req: Request): Promise<void> {
  const { role } = await callerRole(req);
  if (role !== "admin" && role !== "staff") {
    throw new HttpError(403, "Only Active Zone Outdoor staff can do this.");
  }
}

/** Checks the caller is staff, or the leader of this event (the event's leader email is theirs). */
export async function requireStaffOrEventLeader(req: Request, eventId: string): Promise<void> {
  const { email, role } = await callerRole(req);
  if (role === "admin" || role === "staff") return;
  if (role === "leader") {
    const { data, error } = await admin().from("events").select("leader_email").eq("id", eventId).maybeSingle();
    if (error) throw error;
    if (data?.leader_email?.trim().toLowerCase() === email) return;
  }
  throw new HttpError(403, "Only Active Zone Outdoor staff or the event's leader can do this.");
}

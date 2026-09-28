// Google Drive access through a service account that is a Content Manager on the albums Shared Drive.
import { admin, type EventRow } from "./db.ts";

const DRIVE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const EVENT_TIME_ZONE = "Asia/Nicosia";

type ServiceAccount = { client_email: string; private_key: string };

export type DriveFile = { id: string; name: string; mimeType: string; size?: string; parents?: string[] };

let cachedToken: { value: string; expiresAt: number } | null = null;

function sharedDriveId(): string {
  const id = Deno.env.get("AZO_SHARED_DRIVE_ID");
  if (!id) throw new Error("AZO_SHARED_DRIVE_ID is not set.");
  return id;
}

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const account = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "{}") as ServiceAccount;
  if (!account.client_email || !account.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set.");

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))}`;

  const pem = account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  cachedToken = { value: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

async function drive(path: string, init: RequestInit = {}, params: Record<string, string> = {}): Promise<Response> {
  const url = new URL(path.startsWith("http") ? path : `${DRIVE}${path}`);
  url.searchParams.set("supportsAllDrives", "true");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await accessToken()}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=UTF-8");

  const res = await fetch(url, { ...init, headers });
  if (!res.ok && res.status !== 404) throw new Error(`Drive ${init.method ?? "GET"} ${url.pathname} failed: ${res.status} ${await res.text()}`);
  return res;
}

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const list = await drive("/files", {}, {
    q: `name = '${escaped}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    corpora: "drive",
    driveId: sharedDriveId(),
    includeItemsFromAllDrives: "true",
    fields: "files(id)",
  });
  const existing = (await list.json()).files?.[0]?.id as string | undefined;
  if (existing) return existing;

  const created = await drive("/files", {
    method: "POST",
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  }, { fields: "id" });
  return (await created.json()).id;
}

function folderPart(value: string): string {
  return value
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "Event";
}

/** e.g. 2026-09-27_SUP_Ayia-Napa, using the event's local date in Cyprus. */
export function eventFolderName(event: Pick<EventRow, "starts_at" | "activity" | "location_name">): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(event.starts_at));
  return `${date}_${folderPart(event.activity)}_${folderPart(event.location_name)}`;
}

/** Returns the event's Drive folder, creating <year>/<event folder> in the Shared Drive on first use. */
export async function ensureEventFolder(event: EventRow): Promise<string> {
  if (event.drive_folder_id) return event.drive_folder_id;

  const name = eventFolderName(event);
  const yearFolder = await findOrCreateFolder(name.slice(0, 4), sharedDriveId());
  const folderId = await findOrCreateFolder(name, yearFolder);

  const { data, error } = await admin()
    .from("events")
    .update({ drive_folder_id: folderId })
    .eq("id", event.id)
    .is("drive_folder_id", null)
    .select("drive_folder_id")
    .maybeSingle();
  if (error) throw error;
  if (data) return folderId;

  // Another upload created the folder at the same moment; use theirs.
  const { data: current, error: readError } = await admin().from("events").select("drive_folder_id").eq("id", event.id).single();
  if (readError) throw readError;
  return current.drive_folder_id;
}

/**
 * Starts a resumable upload into the folder and returns the session URL.
 * Passing the browser's Origin lets the participant's browser upload the bytes straight to Google.
 */
export async function startResumableUpload(opts: {
  folderId: string;
  name: string;
  mimeType: string;
  size: number;
  origin: string;
  description?: string;
}): Promise<string> {
  const res = await drive(`${DRIVE_UPLOAD}/files`, {
    method: "POST",
    headers: {
      "X-Upload-Content-Type": opts.mimeType,
      "X-Upload-Content-Length": String(opts.size),
      "Origin": opts.origin,
    },
    body: JSON.stringify({ name: opts.name, parents: [opts.folderId], description: opts.description }),
  }, { uploadType: "resumable", fields: "id,name,mimeType,size,parents" });

  const location = res.headers.get("Location");
  if (!location) throw new Error("Drive did not return an upload session URL.");
  return location;
}

export async function getFile(fileId: string): Promise<DriveFile | null> {
  const res = await drive(`/files/${encodeURIComponent(fileId)}`, {}, { fields: "id,name,mimeType,size,parents" });
  return res.status === 404 ? null : await res.json();
}

/** Makes a file viewable by anyone with its link (needed for the public album), or removes that access. */
export async function setPublicLink(fileId: string, isPublic: boolean): Promise<void> {
  const id = encodeURIComponent(fileId);
  if (isPublic) {
    await drive(`/files/${id}/permissions`, {
      method: "POST",
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
    }, { fields: "id" });
  } else {
    await drive(`/files/${id}/permissions/anyoneWithLink`, { method: "DELETE" });
  }
}

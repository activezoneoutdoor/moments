import type { SupabaseClient } from "@supabase/supabase-js";

export type EventStatus = "draft" | "published" | "cancelled" | "archived";
export type AlbumStatus = "none" | "collecting" | "published";
export type MediaStatus = "pending" | "approved" | "hidden";

export type AzoEvent = {
  id: string;
  slug: string;
  title: string;
  activity: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string;
  lat: number | null;
  lng: number | null;
  leader_name: string | null;
  leader_email: string | null;
  partners: string[];
  max_participants: number | null;
  bookings_open: boolean;
  booking_closes_at: string | null;
  /** Shown to participants in the email when the event is cancelled. */
  cancellation_note: string | null;
  /** Leader emails about bookings: none, one per change, or a daily summary. */
  leader_notify: "none" | "each" | "daily";
  /** Price per seat in cents; null or 0 means free. */
  price_cents: number | null;
  currency: string;
  /** Where participants pay, e.g. a Revolut.me link. */
  payment_link: string | null;
  payment_note: string | null;
  description: string | null;
  status: EventStatus;
  album_status: AlbumStatus;
  drive_folder_id: string | null;
  cover_media_id: string | null;
  cover_drive_file_id: string | null;
  /** Present when loaded with `coverMediaJoin`. */
  cover?: { drive_file_id: string } | null;
};

export type Media = {
  id: string;
  event_id: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
  size: number | null;
  uploader_name: string | null;
  /** "drive" when the file was added directly in the event's Drive folder. */
  source: "upload" | "drive";
  status: MediaStatus;
  sort_order: number;
  created_at: string;
};

export function formatMoney(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

/** What an album sync with the event's Drive folder changed. */
export type SyncSummary = {
  added: number;
  removed: number;
  renamed: number;
  folderAdopted: boolean;
  folderRenamed: boolean;
  warning: string | null;
};

export function describeSync(summary: SyncSummary): string {
  const parts = [
    summary.added && `${summary.added} added from Drive (to review)`,
    summary.removed && `${summary.removed} removed (deleted in Drive)`,
    summary.renamed && `${summary.renamed} renamed`,
    summary.folderAdopted && "linked the existing Drive folder",
    summary.folderRenamed && "renamed the Drive folder to match the event",
  ].filter(Boolean);
  return parts.length ? `Synced with Drive: ${parts.join(", ")}.` : "";
}

export const activities = ["Hiking", "SUP", "Kayaking", "Cycling", "Snorkeling", "Climbing", "Camping", "Trail running"];

/** Embeds the album photo chosen as the event photo (events.cover_media_id). */
export const coverMediaJoin = "cover:media!events_cover_media_fk(drive_file_id)";

export const publicEventColumns =
  "id, slug, title, activity, starts_at, ends_at, location_name, lat, lng, leader_name, partners, max_participants, bookings_open, booking_closes_at, price_cents, currency, description, status, album_status, cover_media_id, cover_drive_file_id";

export function driveThumbnail(fileId: string, width = 800): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
}

export function drivePreview(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

export function isVideo(media: Pick<Media, "mime_type">): boolean {
  return media.mime_type.startsWith("video/");
}

export function slugify(...parts: string[]): string {
  return parts.join(" ")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Nicosia" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia" });

const yearFormat = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Asia/Nicosia" });

/** The event's year in Cyprus time, e.g. "2026". */
export function eventYear(event: Pick<AzoEvent, "starts_at">): string {
  return yearFormat.format(new Date(event.starts_at));
}

export function formatEventDate(event: Pick<AzoEvent, "starts_at" | "ends_at">): string {
  const start = new Date(event.starts_at);
  const text = `${dateFormat.format(start)} · ${timeFormat.format(start)}`;
  if (!event.ends_at) return text;
  const end = new Date(event.ends_at);
  return dateFormat.format(end) === dateFormat.format(start)
    ? `${text}–${timeFormat.format(end)}`
    : `${text} → ${dateFormat.format(end)}`;
}

export function uploadLinkUrl(token: string): string {
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/upload/?t=${encodeURIComponent(token)}`;
}

export function eventPageUrl(slug: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/event/?slug=${encodeURIComponent(slug)}`;
}

/** Calls a Supabase Edge Function and surfaces its `error` message. */
export async function callFunction<T>(supabase: SupabaseClient, name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // The function answered with an error status: its JSON body carries a readable message.
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const detail = await context.json().catch(() => null);
      throw new Error(detail?.error ?? error.message);
    }
    // No readable answer at all: the request was blocked or the function is unreachable.
    console.error(`Edge Function "${name}" could not be reached`, context ?? error);
    throw new Error("Couldn't reach the upload service. Please try again in a moment; if it keeps failing, tell the event leader.");
  }
  return data as T;
}

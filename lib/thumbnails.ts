"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Staff previews come through the media-thumbnail Edge Function (Drive thumbnails need Google
// cookies that browsers often block). Results are cached for the page's lifetime.
const cache = new Map<string, Promise<string | null>>();
const MAX_PARALLEL = 4;
let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function fetchThumbnail(supabase: SupabaseClient, mediaId: string, size: number): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  // Called directly: functions.invoke would decode an image response as text.
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/media-thumbnail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaId, size }),
  });
  if (!res.ok || !res.headers.get("Content-Type")?.startsWith("image/")) return null;
  return URL.createObjectURL(await res.blob());
}

/** Object URL of a media item's preview for staff, `null` when none is available, `undefined` while loading. */
export function useStaffThumbnail(supabase: SupabaseClient, mediaId: string | null, size = 480): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(mediaId ? undefined : null);

  useEffect(() => {
    if (!mediaId) {
      setUrl(null);
      return;
    }
    let active = true;
    const key = `${mediaId}:${size}`;
    if (!cache.has(key)) {
      const request = withSlot(() => fetchThumbnail(supabase, mediaId, size)).catch(() => null);
      cache.set(key, request);
      // Let a failed preview be retried when the panel is opened again.
      void request.then((result) => { if (!result) cache.delete(key); });
    }
    void cache.get(key)!.then((result) => { if (active) setUrl(result); });
    return () => { active = false; };
  }, [supabase, mediaId, size]);

  return url;
}

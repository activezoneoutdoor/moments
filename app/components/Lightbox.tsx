"use client";

import { useEffect } from "react";
import { drivePreview, driveThumbnail, isVideo, type Media } from "@/lib/events";

type Props = { items: Media[]; index: number; onChange: (index: number | null) => void };

export function Lightbox({ items, index, onChange }: Props) {
  const item = items[index];
  const go = (step: number) => onChange((index + step + items.length) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChange(null);
      if (e.key === "ArrowRight") onChange((index + 1) % items.length);
      if (e.key === "ArrowLeft") onChange((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onChange]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Album viewer" onClick={() => onChange(null)}>
      <div className="lightbox-media" onClick={(e) => e.stopPropagation()}>
        {isVideo(item)
          ? <iframe src={drivePreview(item.drive_file_id)} allow="autoplay; fullscreen" allowFullScreen title={item.name} />
          : <img src={driveThumbnail(item.drive_file_id, 2400)} alt={item.name} referrerPolicy="no-referrer" />}
        {item.uploader_name && <p className="lightbox-credit">📷 {item.uploader_name}</p>}
      </div>
      <button className="lightbox-close" aria-label="Close" onClick={() => onChange(null)}>×</button>
      {items.length > 1 && <>
        <button className="lightbox-nav prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
        <button className="lightbox-nav next" aria-label="Next" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
      </>}
    </div>
  );
}

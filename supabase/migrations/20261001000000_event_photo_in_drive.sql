-- Event photos live in the event's Google Drive folder (shared by link) instead of Supabase Storage.
-- Safe on databases that never had the earlier Storage version.

alter table public.events drop column if exists cover_image_path;
alter table public.events add column cover_drive_file_id text;

drop policy if exists "staff read event covers" on storage.objects;
drop policy if exists "staff upload event covers" on storage.objects;
drop policy if exists "staff update event covers" on storage.objects;
drop policy if exists "staff delete event covers" on storage.objects;
-- Delete the now unused "event-covers" bucket in the Supabase dashboard (Storage), which also removes its files.

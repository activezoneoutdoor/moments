-- Where an album file came from: the participant upload page, or added directly in the Drive folder.
alter table public.media add column if not exists source text not null default 'upload'
  check (source in ('upload', 'drive'));

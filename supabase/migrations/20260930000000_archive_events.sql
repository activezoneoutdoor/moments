-- Archived events are hidden from the public (the public policies only allow published and
-- cancelled events) but keep their album, media records and Drive folder so they can be restored.

alter table public.events drop constraint events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'published', 'cancelled', 'archived'));

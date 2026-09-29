-- Lets the public event page show whether uploads are open, and the upload link while they are.
-- The token is only returned for published events whose link is open and not expired.
create or replace function public.public_upload_link(p_event_id uuid)
returns table (accepting boolean, token text)
language sql
stable
security definer
set search_path = ''
as $$
  select open_now, case when open_now then l.token end
  from public.events e
  join public.event_upload_links l on l.event_id = e.id
  cross join lateral (
    select e.status = 'published' and l.open and (l.expires_at is null or l.expires_at > now()) as open_now
  ) state
  where e.id = p_event_id and e.status in ('published', 'cancelled')
$$;

revoke execute on function public.public_upload_link(uuid) from public;
grant execute on function public.public_upload_link(uuid) to anon, authenticated;

-- Events, participant upload links and album media.
-- Media files live in a Google Workspace Shared Drive; these tables hold metadata only.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt()->>'email') ~ '@activezoneoutdoor\.cy$', false)
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  activity text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_name text not null,
  lat double precision,
  lng double precision,
  leader_name text,
  leader_email text,
  partners text[] not null default '{}',
  max_participants integer check (max_participants is null or max_participants > 0),
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  album_status text not null default 'none' check (album_status in ('none', 'collecting', 'published')),
  drive_folder_id text,
  cover_media_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index events_starts_at_idx on public.events (starts_at desc);

-- Kept apart from events so that anonymous readers can never select a token.
create table public.event_upload_links (
  event_id uuid primary key references public.events (id) on delete cascade,
  token text not null unique default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'),
  open boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  drive_file_id text not null unique,
  name text not null,
  mime_type text not null,
  size bigint,
  uploader_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index media_event_idx on public.media (event_id, sort_order, created_at);

alter table public.events
  add constraint events_cover_media_fk foreign key (cover_media_id) references public.media (id) on delete set null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_touch_updated_at before update on public.events
  for each row execute function public.touch_updated_at();

-- Every new event gets an upload link.
create or replace function public.create_event_upload_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_upload_links (event_id) values (new.id);
  return new;
end;
$$;

create trigger events_create_upload_link after insert on public.events
  for each row execute function public.create_event_upload_link();

create or replace function public.rotate_upload_link(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_token text;
begin
  if not public.is_staff() then
    raise exception 'Only Active Zone Outdoor staff can rotate upload links.' using errcode = '42501';
  end if;

  insert into public.event_upload_links (event_id) values (p_event_id)
  on conflict (event_id) do update
    set token = translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'),
        open = true,
        created_at = now()
  returning token into new_token;

  return new_token;
end;
$$;

revoke execute on function public.rotate_upload_link(uuid) from public, anon;
grant execute on function public.rotate_upload_link(uuid) to authenticated;

-- Lets the public upload page show which event a link belongs to, without exposing tokens.
create or replace function public.upload_link_event(p_token text)
returns table (title text, activity text, starts_at timestamptz, location_name text, accepting boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select e.title, e.activity, e.starts_at, e.location_name,
         l.open and (l.expires_at is null or l.expires_at > now())
  from public.event_upload_links l
  join public.events e on e.id = l.event_id
  where l.token = p_token
$$;

revoke execute on function public.upload_link_event(text) from public;
grant execute on function public.upload_link_event(text) to anon, authenticated;

-- Row Level Security
alter table public.events enable row level security;
alter table public.event_upload_links enable row level security;
alter table public.media enable row level security;

create policy "staff manage events" on public.events
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "public reads published events" on public.events
  for select to anon, authenticated using (status in ('published', 'cancelled'));

create policy "staff manage upload links" on public.event_upload_links
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff manage media" on public.media
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "public reads published album media" on public.media
  for select to anon, authenticated using (
    status = 'approved'
    and exists (
      select 1 from public.events e
      where e.id = media.event_id
        and e.status in ('published', 'cancelled')
        and e.album_status = 'published'
    )
  );

grant select on public.events, public.media to anon;
grant select, insert, update, delete on public.events, public.event_upload_links, public.media to authenticated;

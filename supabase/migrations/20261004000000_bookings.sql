-- Seat booking. Participants book without an account and get a private link to view or cancel.
-- Seats are confirmed instantly while capacity lasts; after that bookings join a waitlist that is
-- promoted automatically when seats free up.

alter table public.events
  add column bookings_open boolean not null default false,
  add column booking_closes_at timestamptz;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  token text not null unique default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'),
  contact_name text not null check (length(contact_name) between 1 and 100),
  email text not null check (length(email) <= 200),
  phone text check (length(phone) <= 40),
  attendees text[] not null check (cardinality(attendees) between 1 and 4),
  seats integer generated always as (cardinality(attendees)) stored,
  note text check (length(note) <= 1000),
  status text not null default 'confirmed' check (status in ('confirmed', 'waitlisted', 'cancelled')),
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  cancelled_at timestamptz
);

create index bookings_event_idx on public.bookings (event_id, status, created_at);

alter table public.bookings enable row level security;

create policy "staff manage bookings" on public.bookings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.bookings to authenticated;

-- Confirms waitlisted bookings, oldest first, while seats are free. A booking that needs more seats than
-- remain is skipped so a smaller one behind it can go ahead. Nothing is promoted once the event started.
create or replace function public.promote_waitlist(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  capacity integer;
  starts timestamptz;
  taken integer;
  candidate record;
begin
  select max_participants, starts_at into capacity, starts from public.events where id = p_event_id for update;
  if not found or starts <= now() then
    return;
  end if;

  select coalesce(sum(seats), 0) into taken from public.bookings where event_id = p_event_id and status = 'confirmed';

  for candidate in
    select id, seats from public.bookings where event_id = p_event_id and status = 'waitlisted' order by created_at
  loop
    if capacity is null or taken + candidate.seats <= capacity then
      update public.bookings set status = 'confirmed', promoted_at = now() where id = candidate.id;
      taken := taken + candidate.seats;
    end if;
  end loop;
end;
$$;

revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;

create or replace function public.promote_after_booking_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status = 'confirmed' then
    perform public.promote_waitlist(new.event_id);
  end if;
  return null;
end;
$$;

create trigger bookings_promote_waitlist after update of status on public.bookings
  for each row execute function public.promote_after_booking_change();

create or replace function public.promote_after_capacity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.max_participants is distinct from old.max_participants then
    perform public.promote_waitlist(new.id);
  end if;
  return null;
end;
$$;

create trigger events_promote_waitlist after update of max_participants on public.events
  for each row execute function public.promote_after_capacity_change();

-- Seats and booking state for the public event page.
create or replace function public.public_booking_status(p_event_id uuid)
returns table (open boolean, capacity integer, confirmed_seats integer, available integer, waitlisted integer, closes_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.status = 'published' and e.bookings_open and now() < coalesce(e.booking_closes_at, e.starts_at),
    e.max_participants,
    taken.seats,
    case when e.max_participants is null then null else greatest(e.max_participants - taken.seats, 0) end,
    taken.waiting,
    coalesce(e.booking_closes_at, e.starts_at)
  from public.events e
  cross join lateral (
    select
      coalesce(sum(b.seats) filter (where b.status = 'confirmed'), 0)::integer as seats,
      count(*) filter (where b.status = 'waitlisted')::integer as waiting
    from public.bookings b where b.event_id = e.id
  ) taken
  where e.id = p_event_id and e.status in ('published', 'cancelled')
$$;

-- Books seats. The event row is locked while seats are counted, so two people can't take the last seat.
create or replace function public.book_event(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_attendees text[],
  p_note text default null
)
returns table (token text, status text, waitlist_position integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events;
  names text[];
  wanted integer;
  taken integer;
  new_status text;
  new_token text;
  created timestamptz;
begin
  select * into ev from public.events where id = p_event_id for update;
  if not found or ev.status <> 'published' then
    raise exception 'This event is not taking bookings.';
  end if;
  if not ev.bookings_open or now() >= coalesce(ev.booking_closes_at, ev.starts_at) then
    raise exception 'Bookings for this event are closed.';
  end if;

  p_name := trim(coalesce(p_name, ''));
  p_email := lower(trim(coalesce(p_email, '')));
  p_phone := nullif(trim(coalesce(p_phone, '')), '');
  if p_name = '' or length(p_name) > 100 then
    raise exception 'Please enter your name.';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;

  select coalesce(array_agg(trim(n)), '{}') into names from unnest(p_attendees) as n where trim(n) <> '';
  wanted := cardinality(names);
  if wanted < 1 or wanted > 4 or wanted <> cardinality(p_attendees) then
    raise exception 'Please enter a name for every seat (up to 4).';
  end if;
  if ev.max_participants is not null and wanted > ev.max_participants then
    raise exception 'This event has only % seats in total.', ev.max_participants;
  end if;

  if exists (
    select 1 from public.bookings b
    where b.event_id = p_event_id and b.email = p_email and b.status in ('confirmed', 'waitlisted')
  ) then
    raise exception 'There is already a booking for this event with this email. Use the link from that booking to view or cancel it.';
  end if;

  select coalesce(sum(b.seats), 0) into taken from public.bookings b where b.event_id = p_event_id and b.status = 'confirmed';
  new_status := case when ev.max_participants is null or taken + wanted <= ev.max_participants then 'confirmed' else 'waitlisted' end;

  insert into public.bookings (event_id, contact_name, email, phone, attendees, note, status)
  values (p_event_id, p_name, p_email, p_phone, names, nullif(trim(coalesce(p_note, '')), ''), new_status)
  returning bookings.token, bookings.created_at into new_token, created;

  return query select new_token, new_status,
    case when new_status = 'waitlisted' then (
      select count(*)::integer from public.bookings b
      where b.event_id = p_event_id and b.status = 'waitlisted' and b.created_at <= created
    ) end;
end;
$$;

-- A booking as seen through its private link.
create or replace function public.get_booking(p_token text)
returns table (
  status text, contact_name text, email text, phone text, attendees text[], seats integer, created_at timestamptz,
  waitlist_position integer, event_title text, event_slug text, event_starts_at timestamptz, event_location text,
  can_cancel boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.status, b.contact_name, b.email, b.phone, b.attendees, b.seats, b.created_at,
    case when b.status = 'waitlisted' then (
      select count(*)::integer from public.bookings w
      where w.event_id = b.event_id and w.status = 'waitlisted' and w.created_at <= b.created_at
    ) end,
    e.title, e.slug, e.starts_at, e.location_name,
    b.status in ('confirmed', 'waitlisted') and e.starts_at > now()
  from public.bookings b
  join public.events e on e.id = b.event_id
  where b.token = p_token
$$;

-- Cancels a booking through its private link; freed seats go to the waitlist (see the trigger above).
create or replace function public.cancel_booking(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  update public.bookings b set status = 'cancelled', cancelled_at = now()
  from public.events e
  where b.token = p_token and e.id = b.event_id and b.status in ('confirmed', 'waitlisted') and e.starts_at > now()
  returning b.status into result;

  if result is null then
    raise exception 'This booking can no longer be cancelled.';
  end if;
  return result;
end;
$$;

revoke execute on function public.public_booking_status(uuid) from public;
revoke execute on function public.book_event(uuid, text, text, text, text[], text) from public;
revoke execute on function public.get_booking(text) from public;
revoke execute on function public.cancel_booking(text) from public;
grant execute on function public.public_booking_status(uuid) to anon, authenticated;
grant execute on function public.book_event(uuid, text, text, text, text[], text) to anon, authenticated;
grant execute on function public.get_booking(text) to anon, authenticated;
grant execute on function public.cancel_booking(text) to anon, authenticated;

-- Cancelling an event cancels its bookings and emails everyone; event leaders can get an email for
-- every booking change or a daily summary.

alter table public.bookings
  add column cancel_reason text check (cancel_reason in ('participant', 'staff', 'event_cancelled'));

alter table public.events
  add column cancellation_note text check (length(cancellation_note) <= 2000),
  add column leader_notify text not null default 'none' check (leader_notify in ('none', 'each', 'daily'));

-- The outbox now also holds leader emails, and daily summaries that belong to an event rather than a booking.
alter table public.email_outbox
  alter column booking_id drop not null,
  add column event_id uuid references public.events (id) on delete cascade,
  add column recipient text not null default 'participant' check (recipient in ('participant', 'leader')),
  add column period_start timestamptz;

update public.email_outbox o set event_id = b.event_id from public.bookings b where b.id = o.booking_id;
alter table public.email_outbox alter column event_id set not null;

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('confirmed', 'waitlisted', 'promoted', 'cancelled', 'reminder', 'event_cancelled', 'leader_summary'));
alter table public.email_outbox add constraint email_outbox_booking_check
  check (booking_id is not null or kind = 'leader_summary');

drop index public.email_outbox_one_reminder;
create unique index email_outbox_one_reminder on public.email_outbox (booking_id) where kind = 'reminder' and recipient = 'participant';
create index email_outbox_event_idx on public.email_outbox (event_id, kind, created_at);

-- Queue the participant's email, plus the leader's when they asked for every change.
create or replace function public.queue_booking_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_kind text;
  ev public.events;
begin
  if tg_op = 'INSERT' then
    email_kind := new.status;
  elsif new.status = 'confirmed' and old.status = 'waitlisted' then
    email_kind := 'promoted';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    email_kind := case when new.cancel_reason = 'event_cancelled' then 'event_cancelled' else 'cancelled' end;
  end if;

  if email_kind is null then
    return null;
  end if;

  insert into public.email_outbox (booking_id, event_id, kind) values (new.id, new.event_id, email_kind);

  select * into ev from public.events where id = new.event_id;
  if ev.leader_notify = 'each' and ev.leader_email is not null and email_kind <> 'event_cancelled' then
    insert into public.email_outbox (booking_id, event_id, kind, recipient) values (new.id, new.event_id, email_kind, 'leader');
  end if;
  return null;
end;
$$;

-- Setting an event to cancelled cancels all its active bookings (each participant gets an email).
create or replace function public.cancel_bookings_of_cancelled_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = 'event_cancelled'
    where event_id = new.id and status in ('confirmed', 'waitlisted');
  end if;
  return null;
end;
$$;

create trigger events_cancel_bookings after update of status on public.events
  for each row execute function public.cancel_bookings_of_cancelled_event();

-- Only published events promote their waitlist.
create or replace function public.promote_waitlist(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  capacity integer;
  starts timestamptz;
  event_status text;
  taken integer;
  candidate record;
begin
  select max_participants, starts_at, status into capacity, starts, event_status from public.events where id = p_event_id for update;
  if not found or starts <= now() or event_status <> 'published' then
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

create or replace function public.cancel_booking(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  update public.bookings b set status = 'cancelled', cancelled_at = now(), cancel_reason = 'participant'
  from public.events e
  where b.token = p_token and e.id = b.event_id and b.status in ('confirmed', 'waitlisted') and e.starts_at > now()
  returning b.status into result;

  if result is null then
    raise exception 'This booking can no longer be cancelled.';
  end if;
  return result;
end;
$$;

drop function public.get_booking(text);
create function public.get_booking(p_token text)
returns table (
  status text, contact_name text, email text, phone text, attendees text[], seats integer, created_at timestamptz,
  waitlist_position integer, event_title text, event_slug text, event_starts_at timestamptz, event_location text,
  can_cancel boolean, cancel_reason text, cancellation_note text
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
    b.status in ('confirmed', 'waitlisted') and e.starts_at > now(),
    b.cancel_reason,
    case when b.cancel_reason = 'event_cancelled' then e.cancellation_note end
  from public.bookings b
  join public.events e on e.id = b.event_id
  where b.token = p_token
$$;

revoke execute on function public.get_booking(text) from public;
grant execute on function public.get_booking(text) to anon, authenticated;

-- Once a day from 19:00 Cyprus time, queue a summary for leaders who asked for one, for upcoming events
-- with booking activity since their last summary.
create or replace function public.queue_leader_summaries()
returns integer
language sql
security definer
set search_path = ''
as $$
  with due as (
    select e.id, coalesce(last.created_at, now() - interval '1 day') as since
    from public.events e
    left join lateral (
      select max(o.created_at) as created_at from public.email_outbox o
      where o.event_id = e.id and o.kind = 'leader_summary'
    ) last on true
    where e.leader_notify = 'daily' and e.leader_email is not null and e.status in ('published', 'cancelled')
      and e.starts_at > now() - interval '1 day'
      and (now() at time zone 'Asia/Nicosia')::time >= time '19:00'
      and (last.created_at is null or (last.created_at at time zone 'Asia/Nicosia')::date < (now() at time zone 'Asia/Nicosia')::date)
  ),
  queued as (
    insert into public.email_outbox (event_id, kind, recipient, period_start)
    select d.id, 'leader_summary', 'leader', d.since
    from due d
    where exists (
      select 1 from public.bookings b
      where b.event_id = d.id
        and (b.created_at > d.since or b.cancelled_at > d.since or b.promoted_at > d.since)
    )
    returning 1
  )
  select count(*)::integer from queued
$$;

revoke execute on function public.queue_leader_summaries() from public, anon, authenticated;

drop function public.claim_emails(integer);
create function public.claim_emails(p_limit integer default 25)
returns table (
  id uuid, kind text, recipient text, attempts integer, period_start timestamptz, event_id uuid,
  booking_token text, booking_status text, contact_name text, email text, phone text, note text,
  attendees text[], seats integer, waitlist_position integer, cancel_reason text,
  event_title text, event_slug text, event_starts_at timestamptz, event_ends_at timestamptz, event_location text,
  event_lat double precision, event_lng double precision, leader_name text, leader_email text,
  max_participants integer, cancellation_note text
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.email_outbox o set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
    where o.id in (
      select q.id from public.email_outbox q
      where (q.status = 'queued' or (q.status = 'sending' and q.claimed_at < now() - interval '10 minutes')) and q.attempts < 5
      order by q.created_at
      limit p_limit
      for update skip locked
    )
    returning o.id, o.kind, o.recipient, o.attempts, o.period_start, o.booking_id, o.event_id
  )
  select c.id, c.kind, c.recipient, c.attempts, c.period_start, c.event_id,
    b.token, b.status, b.contact_name, b.email, b.phone, b.note, b.attendees, b.seats,
    case when b.status = 'waitlisted' then (
      select count(*)::integer from public.bookings w
      where w.event_id = b.event_id and w.status = 'waitlisted' and w.created_at <= b.created_at
    ) end,
    b.cancel_reason,
    e.title, e.slug, e.starts_at, e.ends_at, e.location_name, e.lat, e.lng, e.leader_name, e.leader_email,
    e.max_participants, e.cancellation_note
  from claimed c
  join public.events e on e.id = c.event_id
  left join public.bookings b on b.id = c.booking_id
$$;

revoke execute on function public.claim_emails(integer) from public, anon, authenticated;

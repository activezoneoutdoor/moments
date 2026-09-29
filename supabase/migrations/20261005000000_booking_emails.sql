-- Booking emails. Triggers queue an email whenever a booking is made or changes status; the send-emails
-- Edge Function sends queued emails through Gmail (the Workspace account) and retries failures.

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('confirmed', 'waitlisted', 'promoted', 'cancelled', 'reminder')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);

create index email_outbox_queue_idx on public.email_outbox (status, created_at);
create unique index email_outbox_one_reminder on public.email_outbox (booking_id) where kind = 'reminder';

alter table public.email_outbox enable row level security;

create policy "staff read email outbox" on public.email_outbox
  for select to authenticated using (public.is_staff());

grant select on public.email_outbox to authenticated;

create or replace function public.queue_booking_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_kind text;
begin
  if tg_op = 'INSERT' then
    email_kind := new.status;
  elsif new.status = 'confirmed' and old.status = 'waitlisted' then
    email_kind := 'promoted';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    email_kind := 'cancelled';
  end if;

  if email_kind is not null then
    insert into public.email_outbox (booking_id, kind) values (new.id, email_kind);
  end if;
  return null;
end;
$$;

create trigger bookings_queue_email after insert or update of status on public.bookings
  for each row execute function public.queue_booking_email();

-- Queues a reminder for confirmed bookings of events starting within the next 30 hours (once per booking).
create or replace function public.queue_reminders()
returns integer
language sql
security definer
set search_path = ''
as $$
  with queued as (
    insert into public.email_outbox (booking_id, kind)
    select b.id, 'reminder'
    from public.bookings b
    join public.events e on e.id = b.event_id
    where b.status = 'confirmed' and e.status = 'published'
      and e.starts_at > now() and e.starts_at <= now() + interval '30 hours'
      and b.created_at < now() - interval '1 hour'
    on conflict (booking_id) where kind = 'reminder' do nothing
    returning 1
  )
  select count(*)::integer from queued
$$;

-- Hands queued emails to one sender at a time (and re-offers ones stuck in "sending" for 10 minutes),
-- with everything needed to write them.
create or replace function public.claim_emails(p_limit integer default 25)
returns table (
  id uuid, kind text, attempts integer,
  booking_token text, booking_status text, contact_name text, email text, attendees text[], seats integer, waitlist_position integer,
  event_title text, event_slug text, event_starts_at timestamptz, event_ends_at timestamptz, event_location text,
  event_lat double precision, event_lng double precision, leader_name text, leader_email text
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
    returning o.id, o.kind, o.attempts, o.booking_id
  )
  select c.id, c.kind, c.attempts,
    b.token, b.status, b.contact_name, b.email, b.attendees, b.seats,
    case when b.status = 'waitlisted' then (
      select count(*)::integer from public.bookings w
      where w.event_id = b.event_id and w.status = 'waitlisted' and w.created_at <= b.created_at
    ) end,
    e.title, e.slug, e.starts_at, e.ends_at, e.location_name, e.lat, e.lng, e.leader_name, e.leader_email
  from claimed c
  join public.bookings b on b.id = c.booking_id
  join public.events e on e.id = b.event_id
$$;

revoke execute on function public.queue_reminders() from public, anon, authenticated;
revoke execute on function public.claim_emails(integer) from public, anon, authenticated;

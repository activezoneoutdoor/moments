-- Payments by link (e.g. the leader's Revolut.me): an event has a price per seat and a payment link;
-- each booking records what it owes and a short reference to put in the payment note. Payments arrive
-- outside the app, so staff mark bookings as paid (the participant gets a "payment received" email).

alter table public.events
  add column price_cents integer check (price_cents is null or price_cents >= 0),
  add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column payment_link text check (payment_link is null or payment_link ~ '^https://'),
  add column payment_note text check (length(payment_note) <= 1000);

alter table public.bookings
  add column amount_cents integer check (amount_cents is null or amount_cents >= 0),
  add column payment_reference text unique,
  add column payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'unpaid', 'paid', 'refunded')),
  add column paid_at timestamptz;

-- What a new booking owes: the event's current price per seat times its seats (later price changes don't
-- affect existing bookings).
create or replace function public.set_booking_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  price integer;
begin
  select price_cents into price from public.events where id = new.event_id;
  if coalesce(price, 0) > 0 then
    new.amount_cents := price * cardinality(new.attendees);
    new.payment_status := 'unpaid';
    new.payment_reference := 'AZO-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
  else
    new.amount_cents := null;
    new.payment_status := 'not_required';
  end if;
  return new;
end;
$$;

create trigger bookings_set_amount before insert on public.bookings
  for each row execute function public.set_booking_amount();

-- Marking a booking paid emails the participant a receipt.
alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmed', 'waitlisted', 'promoted', 'cancelled', 'reminder', 'event_cancelled', 'leader_summary', 'payment_received'
));

create or replace function public.queue_payment_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status = 'paid' and old.payment_status <> 'paid' then
    insert into public.email_outbox (booking_id, event_id, kind) values (new.id, new.event_id, 'payment_received');
  end if;
  return null;
end;
$$;

create trigger bookings_queue_payment_email after update of payment_status on public.bookings
  for each row execute function public.queue_payment_email();

create or replace function public.stamp_paid_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_status = 'paid' and old.payment_status <> 'paid' then
    new.paid_at := now();
  elsif new.payment_status = 'unpaid' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

create trigger bookings_stamp_paid_at before update of payment_status on public.bookings
  for each row execute function public.stamp_paid_at();

-- The private booking page and the emails now include what's owed and how to pay.
drop function public.get_booking(text);
create function public.get_booking(p_token text)
returns table (
  status text, contact_name text, email text, phone text, attendees text[], seats integer, created_at timestamptz,
  waitlist_position integer, event_title text, event_slug text, event_starts_at timestamptz, event_location text,
  can_cancel boolean, cancel_reason text, cancellation_note text,
  amount_cents integer, currency text, payment_status text, payment_reference text, payment_link text, payment_note text
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
    case when b.cancel_reason = 'event_cancelled' then e.cancellation_note end,
    b.amount_cents, e.currency, b.payment_status, b.payment_reference, e.payment_link, e.payment_note
  from public.bookings b
  join public.events e on e.id = b.event_id
  where b.token = p_token
$$;

revoke execute on function public.get_booking(text) from public;
grant execute on function public.get_booking(text) to anon, authenticated;

drop function public.claim_emails(integer);
create function public.claim_emails(p_limit integer default 25)
returns table (
  id uuid, kind text, recipient text, attempts integer, period_start timestamptz, event_id uuid,
  booking_token text, booking_status text, contact_name text, email text, phone text, note text,
  attendees text[], seats integer, waitlist_position integer, cancel_reason text,
  event_title text, event_slug text, event_starts_at timestamptz, event_ends_at timestamptz, event_location text,
  event_lat double precision, event_lng double precision, leader_name text, leader_email text,
  max_participants integer, cancellation_note text,
  amount_cents integer, currency text, payment_status text, payment_reference text, payment_link text, payment_note text
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
    e.max_participants, e.cancellation_note,
    b.amount_cents, e.currency, b.payment_status, b.payment_reference, e.payment_link, e.payment_note
  from claimed c
  join public.events e on e.id = c.event_id
  left join public.bookings b on b.id = c.booking_id
$$;

revoke execute on function public.claim_emails(integer) from public, anon, authenticated;

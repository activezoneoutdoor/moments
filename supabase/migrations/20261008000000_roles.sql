-- Roles: access comes from the staff_roles table, not from the email domain.
--   admin  - everything, including managing the team (@activezoneoutdoor.cy only)
--   staff  - events, albums, bookings (@activezoneoutdoor.cy only)
--   leader - any email; sees the events whose leader_email is theirs, manages their bookings and payments,
--            and reviews their album uploads
-- Removing a row removes access on the next request: every check reads the table, not the sign-in token.
-- Everyone else who signs in has no staff access.

create table public.staff_roles (
  email      text primary key check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role       text not null check (role in ('admin', 'staff', 'leader')),
  granted_by text,
  granted_at timestamptz not null default now(),
  check (role = 'leader' or email ~ '@activezoneoutdoor\.cy$')
);

-- The signed-in user's email (verified by Google or by the email sign-in code).
create or replace function public.current_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(nullif(trim(auth.jwt()->>'email'), ''))
$$;

-- Security definer so policies on other tables can read staff_roles without granting access to it.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.staff_roles where email = public.current_email()
$$;

-- Same name as before, so every existing staff policy and function now follows the table.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role() in ('admin', 'staff'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role() = 'leader', false)
$$;

-- Whether the signed-in leader leads this event. Security definer: it reads events without going through
-- the events policies (which would call back into here).
create or replace function public.leads_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_leader() and exists (
    select 1 from public.events e
    where e.id = p_event_id and lower(trim(e.leader_email)) = public.current_email()
  )
$$;

revoke execute on function public.my_role(), public.is_staff(), public.is_admin(), public.is_leader(),
  public.leads_event(uuid) from public, anon;
grant execute on function public.my_role(), public.is_staff(), public.is_admin(), public.is_leader(),
  public.leads_event(uuid) to authenticated;
-- current_email() only reads the caller's own token.
grant execute on function public.current_email() to anon, authenticated;

-- ---------- Team management (admins only) ----------

create or replace function public.stamp_role_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  new.granted_by := coalesce(public.current_email(), new.granted_by);
  new.granted_at := now();
  return new;
end;
$$;

create trigger staff_roles_stamp before insert or update on public.staff_roles
  for each row execute function public.stamp_role_grant();

-- There must always be at least one admin, so the team can never lock itself out.
create or replace function public.keep_an_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.staff_roles where role = 'admin') then
    raise exception 'There must be at least one admin.' using errcode = '23514';
  end if;
  return null;
end;
$$;

create trigger staff_roles_keep_an_admin after update or delete on public.staff_roles
  for each statement execute function public.keep_an_admin();

alter table public.staff_roles enable row level security;

create policy "admins read the team, everyone reads their own role" on public.staff_roles
  for select to authenticated using (email = public.current_email() or public.is_admin());
create policy "admins manage the team" on public.staff_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.staff_roles from anon;
grant select, insert, update, delete on public.staff_roles to authenticated;

-- First admin, and everyone who already signed in as staff keeps their access.
insert into public.staff_roles (email, role, granted_by) values
  ('achernar@activezoneoutdoor.cy', 'admin', 'setup')
on conflict (email) do update set role = 'admin';

insert into public.staff_roles (email, role, granted_by)
select distinct lower(trim(u.email)), 'staff', 'setup'
from auth.users u
where lower(trim(u.email)) ~ '^[^@\s]+@activezoneoutdoor\.cy$'
on conflict (email) do nothing;

-- ---------- Leaders ----------

create policy "leaders read their events" on public.events
  for select to authenticated
  using (public.is_leader() and lower(trim(leader_email)) = public.current_email());

create policy "leaders read and update their bookings" on public.bookings
  for select to authenticated using (public.leads_event(event_id));
create policy "leaders update their bookings" on public.bookings
  for update to authenticated using (public.leads_event(event_id)) with check (public.leads_event(event_id));

create policy "leaders read their album media" on public.media
  for select to authenticated using (public.leads_event(event_id));
create policy "leaders review their album media" on public.media
  for update to authenticated using (public.leads_event(event_id)) with check (public.leads_event(event_id));

create policy "leaders read their events' emails" on public.email_outbox
  for select to authenticated using (public.leads_event(event_id));

-- Leaders may only cancel a booking and record its payment; staff may change anything. Checks run for
-- signed-in users only: the waitlist and email triggers (security definer) update bookings freely.
create or replace function public.guard_leader_booking_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_staff() then
    -- paid_at is not in the list: bookings_stamp_paid_at sets it after this check. seats is generated, so it
    -- isn't computed yet in a before trigger (and can't be written anyway).
    if (to_jsonb(new) - array['status', 'cancelled_at', 'cancel_reason', 'payment_status', 'seats'])
       is distinct from (to_jsonb(old) - array['status', 'cancelled_at', 'cancel_reason', 'payment_status', 'seats'])
       or (new.status is distinct from old.status and new.status is distinct from 'cancelled')
       or (new.cancel_reason is distinct from old.cancel_reason and new.cancel_reason is distinct from 'staff') then
      raise exception 'Leaders can only cancel bookings and record payments.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_guard_leader before update on public.bookings
  for each row execute function public.guard_leader_booking_changes();

-- Leaders may only approve or hide their album's files.
create or replace function public.guard_leader_media_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_staff()
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Leaders can only approve or hide album files.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger media_guard_leader before update on public.media
  for each row execute function public.guard_leader_media_changes();

revoke execute on function public.guard_leader_booking_changes(), public.guard_leader_media_changes(),
  public.stamp_role_grant(), public.keep_an_admin() from public, anon, authenticated;

-- ---------- Sign-up ----------

-- Anyone may create an account with an email sign-in code (members, leaders). Google sign-in stays limited
-- to the Workspace domain. Having an account grants nothing by itself; staff_roles decides access.
create or replace function public.enforce_azo_workspace_signup(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  email text := lower(coalesce(event->'user'->>'email', ''));
  provider text := event->'user'->'app_metadata'->>'provider';
begin
  if provider = 'email' and email <> '' then
    return '{}'::jsonb;
  end if;
  if provider = 'google' and email ~ '@activezoneoutdoor\.cy$' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with an email code, or with your Active Zone Outdoor Google Workspace account.'
    )
  );
end;
$$;

-- One member, several sign-ins. A person may sign in with more than one email (a personal address and their
-- @activezoneoutdoor.cy account, say); each sign-in is a separate Supabase account. member_accounts links any number
-- of them to one member record, replacing members.user_id.
--
-- * Staff merge duplicate members (merge_members): sign-ins and payments move to the member kept.
-- * Members link another email themselves (start_account_link, then claim_membership with the token after signing
--   in with the other email), which proves they own both.
-- * Team roles stay with the sign-in (staff_roles is keyed by email), so a personal email linked to a staff
--   member's record gives no team access.

create table public.member_accounts (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  -- The sign-in's email when it was linked, to show which emails can sign in.
  email     text,
  linked_at timestamptz not null default now()
);

create index member_accounts_member_idx on public.member_accounts (member_id);

insert into public.member_accounts (user_id, member_id, email)
select m.user_id, m.id, coalesce(lower(u.email), m.email)
from public.members m
left join auth.users u on u.id = m.user_id
where m.user_id is not null;

-- Short-lived, one-time requests to link another sign-in to a member. Only the token's hash is stored.
create table public.member_link_requests (
  token_hash text primary key,
  member_id  uuid not null references public.members (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 minutes'
);

-- The signed-in user's member id, or null.
create or replace function public.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member_id from public.member_accounts where user_id = auth.uid()
$$;

-- ---------- Policies now follow member_accounts ----------

drop policy "members read own, staff read all" on public.members;
drop policy "members update own, staff update all" on public.members;
drop policy "members read own payments, staff read all" on public.membership_payments;

create policy "members read own, staff read all" on public.members
  for select to authenticated using (id = public.my_member_id() or public.is_staff());
create policy "members update own, staff update all" on public.members
  for update to authenticated
  using (id = public.my_member_id() or public.is_staff())
  with check (id = public.my_member_id() or public.is_staff());
create policy "members read own payments, staff read all" on public.membership_payments
  for select to authenticated using (member_id = public.my_member_id() or public.is_staff());

alter table public.members drop column user_id;

-- Same rules as before, without user_id.
create or replace function public.guard_member_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(nullif(trim(new.email), ''));
  new.full_name := trim(new.full_name);
  new.phone := nullif(trim(new.phone), '');
  new.member_number := nullif(trim(new.member_number), '');

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if current_user in ('anon', 'authenticated') and not public.is_staff() and (
      new.id is distinct from old.id
      or new.email is distinct from old.email
      or new.status is distinct from old.status
      or new.member_number is distinct from old.member_number
      or new.registered_on is distinct from old.registered_on
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Only staff can change membership details.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

alter table public.member_accounts enable row level security;
alter table public.member_link_requests enable row level security;

-- Members see which sign-ins are linked to them and may unlink the others; staff manage all. Links are only
-- created by claim_membership.
create policy "members read own sign-ins, staff read all" on public.member_accounts
  for select to authenticated using (member_id = public.my_member_id() or public.is_staff());
create policy "members unlink their other sign-ins, staff unlink any" on public.member_accounts
  for delete to authenticated using (
    public.is_staff() or (member_id = public.my_member_id() and user_id <> auth.uid())
  );

revoke all on public.member_accounts, public.member_link_requests from anon, authenticated;
grant select, delete on public.member_accounts to authenticated;

-- ---------- Merging ----------

-- Moves remove_id's sign-ins and payments to keep_id and deletes remove_id. keep_id's details win; empty ones are
-- filled from remove_id, the earlier registration date is kept and the status is the more established one
-- (registered, then former, then online). Internal: called by merge_members and claim_membership only.
create or replace function public.merge_member_records(keep_id uuid, remove_id uuid)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  keep   public.members;
  remove public.members;
  rank   constant text[] := array['online', 'former', 'registered'];
  result public.members;
begin
  if keep_id is null or remove_id is null or keep_id = remove_id then
    raise exception 'Choose two different members to merge.';
  end if;
  -- Lock both rows in a fixed order so two merges can't deadlock.
  perform 1 from public.members where id in (keep_id, remove_id) order by id for update;
  select * into keep from public.members where id = keep_id;
  select * into remove from public.members where id = remove_id;
  if keep.id is null or remove.id is null then
    raise exception 'Member not found.';
  end if;

  update public.member_accounts set member_id = keep_id where member_id = remove_id;
  update public.membership_payments set member_id = keep_id where member_id = remove_id;
  update public.member_link_requests set member_id = keep_id where member_id = remove_id;
  -- Delete first: email and member number are unique.
  delete from public.members where id = remove_id;

  update public.members set
    full_name     = case when keep.full_name = '' then remove.full_name else keep.full_name end,
    email         = coalesce(keep.email, remove.email),
    phone         = coalesce(keep.phone, remove.phone),
    member_number = coalesce(keep.member_number, remove.member_number),
    registered_on = least(keep.registered_on, remove.registered_on),
    status        = case when array_position(rank, remove.status) > array_position(rank, keep.status)
                      then remove.status else keep.status end,
    created_at    = least(keep.created_at, remove.created_at)
  where id = keep_id
  returning * into result;
  return result;
end;
$$;

-- Staff: merge two member records of the same person.
create or replace function public.merge_members(p_keep uuid, p_remove uuid)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can merge members.' using errcode = '42501';
  end if;
  return public.merge_member_records(p_keep, p_remove);
end;
$$;

-- ---------- Linking another sign-in ----------

-- Members: start linking another email to their record. Returns a one-time token, valid for 30 minutes, which the
-- website passes to claim_membership after the member signs in with the other email.
create or replace function public.start_account_link()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  mid   uuid := public.my_member_id();
  token text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
begin
  if mid is null then
    raise exception 'Open your profile first.' using errcode = '42501';
  end if;
  delete from public.member_link_requests where member_id = mid or expires_at < now();
  insert into public.member_link_requests (token_hash, member_id)
    values (encode(extensions.digest(token, 'sha256'), 'hex'), mid);
  return token;
end;
$$;

-- Called by the website after every sign-in. Returns the signed-in person's member record:
-- 1. With p_link_token (from start_account_link): links this sign-in to that member. If this sign-in already has
--    its own record, it's merged in only when it holds nothing staff manage (no status, member number or payments);
--    otherwise staff must merge them.
-- 2. The member this sign-in is linked to.
-- 3. A member staff added with the same email and no sign-in yet, which is then linked.
-- 4. Otherwise a new online member.
drop function public.claim_membership();

create function public.claim_membership(p_link_token text default null)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  mail    text := lower(nullif(trim(auth.jwt()->>'email'), ''));
  name    text := coalesce(auth.jwt()->'user_metadata'->>'full_name', auth.jwt()->'user_metadata'->>'name', '');
  target  uuid;
  own     public.members;
  result  public.members;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  -- Two tabs signing in at once must not create two records for one sign-in.
  perform pg_advisory_xact_lock(hashtext('claim_membership:' || uid::text));

  select m.* into own from public.member_accounts a join public.members m on m.id = a.member_id where a.user_id = uid;

  if p_link_token is not null then
    delete from public.member_link_requests
      where token_hash = encode(extensions.digest(p_link_token, 'sha256'), 'hex') and expires_at > now()
      returning member_id into target;
    if target is null then
      raise exception 'This link request has expired. Start again from your profile.';
    end if;
    if own.id = target then
      raise exception 'You signed in with an email that is already linked to this membership.';
    end if;
    if own.id is not null then
      if own.status <> 'online' or own.member_number is not null or own.registered_on is not null
        or exists (select 1 from public.membership_payments where member_id = own.id) then
        raise exception 'This email already has its own membership record. Ask the team to merge the two.';
      end if;
      return public.merge_member_records(target, own.id);
    end if;
    insert into public.member_accounts (user_id, member_id, email) values (uid, target, mail);
    select * into result from public.members where id = target;
    return result;
  end if;

  if own.id is not null then
    return own;
  end if;

  if mail is not null then
    select * into result from public.members m
      where m.email = mail and not exists (select 1 from public.member_accounts a where a.member_id = m.id)
      for update;
    if found then
      insert into public.member_accounts (user_id, member_id, email) values (uid, result.id, mail);
      if result.full_name = '' then
        update public.members set full_name = left(name, 120) where id = result.id returning * into result;
      end if;
      return result;
    end if;
  end if;

  -- The email may already be another member's contact email (set by staff); the new record then has none.
  insert into public.members (email, full_name)
    values (case when exists (select 1 from public.members where email = mail) then null else mail end, left(name, 120))
    returning * into result;
  insert into public.member_accounts (user_id, member_id, email) values (uid, result.id, mail);
  return result;
end;
$$;

revoke execute on function public.my_member_id(), public.merge_member_records(uuid, uuid), public.merge_members(uuid, uuid),
  public.start_account_link(), public.claim_membership(text) from public, anon;
revoke execute on function public.merge_member_records(uuid, uuid) from authenticated;
grant execute on function public.my_member_id(), public.merge_members(uuid, uuid), public.start_account_link(),
  public.claim_membership(text) to authenticated;

-- Staff and admins get a member record (and so a Profile in My account) like everyone else. The team role stays
-- in staff_roles; membership is independent of it, so staff can also be registered NGO members.

-- Called by the website after every sign-in. Returns the signed-in person's member row, creating it on first
-- sign-in. If staff registered the member beforehand with the same email, that row is linked to the account instead.
create or replace function public.claim_membership()
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  mail text := lower(nullif(trim(auth.jwt()->>'email'), ''));
  name text := coalesce(auth.jwt()->'user_metadata'->>'full_name', auth.jwt()->'user_metadata'->>'name', '');
  result public.members;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  select * into result from public.members where user_id = uid;
  if found then
    return result;
  end if;

  if mail is not null then
    update public.members
      set user_id = uid, full_name = case when full_name = '' then left(name, 120) else full_name end
      where email = mail and user_id is null
      returning * into result;
    if found then
      return result;
    end if;
  end if;

  insert into public.members (user_id, email, full_name)
    values (uid, mail, left(name, 120))
    on conflict do nothing
    returning * into result;
  if not found then
    select * into result from public.members where user_id = uid;
  end if;
  return result;
end;
$$;

revoke execute on function public.claim_membership() from public, anon;
grant execute on function public.claim_membership() to authenticated;

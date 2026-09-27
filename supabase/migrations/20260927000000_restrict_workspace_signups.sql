create or replace function public.enforce_azo_workspace_signup(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  email text := lower(coalesce(event->'user'->>'email', ''));
  provider text := event->'user'->'app_metadata'->>'provider';
begin
  if email ~ '@activezoneoutdoor\.cy$' and provider = 'google' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Use your Active Zone Outdoor Google Workspace account to sign in.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.enforce_azo_workspace_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.enforce_azo_workspace_signup(jsonb) from public, anon, authenticated;

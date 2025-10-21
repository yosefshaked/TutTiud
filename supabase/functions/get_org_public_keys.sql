begin;

create or replace function public.get_org_public_keys(p_org_id uuid)
  returns table (supabase_url text, anon_key text)
  language sql
  security definer
  set search_path = public
  stable
as $$
  select settings.supabase_url,
         settings.anon_key
  from public.org_settings as settings
  where settings.org_id = p_org_id
    and exists (
      select 1
      from public.org_memberships as memberships
      where memberships.org_id = p_org_id
        and memberships.user_id = auth.uid()
    );
$$;

revoke all on function public.get_org_public_keys(uuid) from public;
grant execute on function public.get_org_public_keys(uuid) to authenticated, service_role;

commit;

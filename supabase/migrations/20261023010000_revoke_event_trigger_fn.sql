-- Security advisor 0028/0029: public.rls_auto_enable() is Supabase's event-trigger function that
-- turns RLS on for new tables. It is SECURITY DEFINER and was executable by anon/authenticated
-- through /rest/v1/rpc. Event-trigger functions cannot be called directly, but nobody needs
-- EXECUTE on it — the event trigger runs it as its owner regardless.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- Future functions in public are not executable by anon unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon;

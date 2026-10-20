-- Address Supabase security advisors on the core schema.

-- Pin search_path on the remaining plain functions.
alter function public.set_updated_at() set search_path = '';
alter function public.audit_log_immutable() set search_path = '';

-- Trigger functions are never called directly; nobody needs EXECUTE via /rest/v1/rpc.
revoke execute on function public.audit_chain() from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.enforce_maker_checker() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.audit_log_immutable() from public, anon, authenticated;

-- RLS helpers: signed-in users need EXECUTE because policies call them as the invoking
-- user; they only reveal the caller's own org/roles/visibility. Anonymous users get nothing.
revoke execute on function public.current_org_id() from public, anon;
revoke execute on function public.has_role(public.app_role) from public, anon;
revoke execute on function public.can_see_case(uuid) from public, anon;
revoke execute on function public.can_edit_case(uuid) from public, anon;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.can_see_case(uuid) to authenticated;
grant execute on function public.can_edit_case(uuid) to authenticated;

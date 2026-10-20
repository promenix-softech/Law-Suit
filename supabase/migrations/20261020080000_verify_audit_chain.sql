-- Recomputes the caller's organisation's audit hash chain. Returns the number of rows checked
-- and the first row id that does not match (null when the chain is intact). Admins only.
create or replace function public.verify_audit_chain()
returns table (rows_checked bigint, first_broken_id bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  org uuid := public.current_org_id();
  r record;
  prev text := '';
  n bigint := 0;
begin
  if org is null or not public.has_role('admin') then
    raise exception 'only admins can verify the audit log' using errcode = 'insufficient_privilege';
  end if;
  for r in select * from public.audit_log where org_id = org order by id loop
    n := n + 1;
    if r.prev_hash is distinct from prev
       or r.row_hash is distinct from encode(extensions.digest(
            concat_ws('|', r.prev_hash, r.org_id, r.actor_id, r.action, r.entity,
                      r.entity_id, r.before_hash, r.after_hash, r.at), 'sha256'), 'hex') then
      return query select n, r.id;
      return;
    end if;
    prev := r.row_hash;
  end loop;
  return query select n, null::bigint;
end $$;

revoke execute on function public.verify_audit_chain() from public, anon;
grant execute on function public.verify_audit_chain() to authenticated;

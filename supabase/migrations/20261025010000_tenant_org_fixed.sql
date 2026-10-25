-- Follow-up to tenant_same_org (security review):
-- 1. A row never changes office. Without this, moving a parent (a case, a user) with the service
--    role would leave its children in the old office and expose them to the new one, and the
--    "unchanged link" shortcut in enforce_same_org() would be unsound.
-- 2. enforce_same_org() fails closed when a listed column does not exist (typo / later rename).
-- 3. documents.batch_id (no FK) is checked as well.

create or replace function public.org_id_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception '%.org_id cannot change: a row never moves to another office', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

revoke execute on function public.org_id_immutable() from public, anon, authenticated;

do $$
declare
  t text;
begin
  for t in select c.table_name from information_schema.columns c
             join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
            where c.table_schema = 'public' and c.column_name = 'org_id' and tb.table_type = 'BASE TABLE' loop
    execute format('create trigger org_id_fixed before update of org_id on public.%I
                    for each row execute function public.org_id_immutable()', t);
  end loop;
end $$;

create or replace function public.enforce_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(new);
  prior jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  org uuid := (rec ->> 'org_id')::uuid;
  i int := 0;
  col text;
  target text;
  ref uuid;
  ok boolean;
begin
  -- Arguments come in pairs: column name, then the referenced table ('user' = an app user).
  while i < tg_nargs loop
    col := tg_argv[i];
    target := tg_argv[i + 1];
    i := i + 2;
    if not rec ? col then
      raise exception 'same_org: %.% does not exist', tg_table_name, col;
    end if;
    ref := (rec ->> col)::uuid;
    continue when ref is null;
    -- org_id never changes (org_id_fixed), so an unchanged link was checked when it was written.
    continue when prior is not null and (prior ->> col) is not distinct from (rec ->> col);
    if target = 'user' then
      select exists (select 1 from public.profiles p where p.id = ref and p.org_id = org) into ok;
    else
      execute format('select exists (select 1 from public.%I where id = $1 and org_id = $2)', target)
        into ok using ref, org;
    end if;
    if not ok then
      raise exception '%.% must belong to the same office', tg_table_name, col using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;

revoke execute on function public.enforce_same_org() from public, anon, authenticated;

drop trigger same_org on public.documents;
create trigger same_org before insert or update on public.documents
for each row execute function public.enforce_same_org('case_id', 'cases', 'batch_id', 'batches', 'uploaded_by', 'user');

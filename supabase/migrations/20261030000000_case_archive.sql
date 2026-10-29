-- Cases are never deleted from the app. An admin archives a case (with a reason) and can restore
-- it; an archived case is hidden from everyone but the office's admins and is read-only until it
-- is restored. Deleting a case is left to the service role (e.g. a DPDP erasure request).

alter table public.cases
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users (id),
  add column archive_reason text check (archive_reason is null or char_length(archive_reason) between 3 and 500),
  add constraint cases_archive_complete check (
    (archived_at is null) = (archived_by is null) and (archived_at is null) = (archive_reason is null)
  );

create index cases_active_idx on public.cases (org_id, created_at desc) where archived_at is null;

comment on column public.cases.archived_at is 'Set by an admin instead of deleting; archived cases are read-only and admin-only';

create or replace function public.guard_case_archive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Service role, migrations and nested triggers are trusted.
  if current_setting('role', true) is distinct from 'authenticated' or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'cases are archived, not deleted' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' then
    if new.archived_at is not null then
      raise exception 'a new case cannot start archived' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if old.archived_at is not null and new.archived_at is not null then
    raise exception 'this case is archived; restore it first' using errcode = 'insufficient_privilege';
  end if;
  if new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by
     or new.archive_reason is distinct from old.archive_reason then
    if not public.has_role('admin') then
      raise exception 'only an admin can archive or restore a case' using errcode = 'insufficient_privilege';
    end if;
    if new.archived_at is not null then
      -- the archiver is the caller and the time is the server's
      new.archived_by := auth.uid();
      new.archived_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger cases_guard_archive before insert or update or delete on public.cases
for each row execute function public.guard_case_archive();
revoke execute on function public.guard_case_archive() from public, anon, authenticated;

-- Archived cases: visible to admins only, editable by nobody (child tables and storage follow,
-- since their policies go through these two functions).
create or replace function public.can_see_case(c_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cases c
    where c.id = c_id
      and c.org_id = public.current_org_id()
      and (c.archived_at is null or public.has_role('admin'))
      and (
        public.has_role('admin')
        or public.has_role('approver')
        or (public.has_role('drafter') and c.assigned_drafter = auth.uid())
        or exists (select 1 from public.tasks t
                    where t.case_id = c.id and t.assignee_id = auth.uid() and t.status in ('open', 'in_progress'))
      )
  )
$$;

create or replace function public.can_edit_case(c_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cases c
    where c.id = c_id and c.org_id = public.current_org_id()
      and c.archived_at is null
      and (public.has_role('admin') or c.assigned_drafter = auth.uid())
  )
$$;

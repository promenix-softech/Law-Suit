-- Field tasks: drafters/admins assign work (collect documents, notary, e-filing, notice
-- dispatch) to field staff; field staff update status with a note and an optional photo.
--
-- Security fix: tasks_update_own let the assignee change any column, including case_id —
-- and field users see cases through their tasks, so re-pointing a task opened any case of
-- the office. Non-admin updates may now change only progress columns.

alter table public.tasks
  add column instructions text check (length(instructions) <= 500),
  add column note text check (length(note) <= 500),
  add column proof_path text,
  add column done_at timestamptz,
  add column created_by uuid references auth.users (id) default auth.uid();

create or replace function public.guard_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.user_roles ur
       where ur.user_id = new.assignee_id and ur.org_id = new.org_id and ur.role = new.role
    ) then
      raise exception 'assignee does not hold that role in this office';
    end if;
    if not exists (select 1 from public.cases c where c.id = new.case_id and c.org_id = new.org_id) then
      raise exception 'case not in this office';
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.has_role('admin') then
    if (new.org_id, new.case_id, new.assignee_id, new.role, new.kind, new.due_at, new.instructions, new.created_by)
       is distinct from
       (old.org_id, old.case_id, old.assignee_id, old.role, old.kind, old.due_at, old.instructions, old.created_by) then
      raise exception 'only progress can be updated on a task' using errcode = 'insufficient_privilege';
    end if;
    if old.status in ('done', 'cancelled') and new.status is distinct from old.status then
      raise exception 'a closed task cannot be reopened' using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' and auth.uid() = old.assignee_id
       and not public.can_edit_case(old.case_id) then
      raise exception 'the assignee cannot cancel a task' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.proof_path is distinct from old.proof_path and new.proof_path is not null
     and not (public.path_in_case(new.proof_path, new.org_id, new.case_id) and split_part(new.proof_path, '/', 3) = 'field') then
    raise exception 'proof must be stored in the case''s field folder';
  end if;
  if new.status = 'done' and old.status <> 'done' then new.done_at := now(); end if;
  return new;
end $$;
revoke execute on function public.guard_task() from public, anon, authenticated;

create trigger tasks_guard before insert or update on public.tasks
for each row execute function public.guard_task();

-- Case editors (assigned drafter, admin) create and see tasks for their cases.
create policy tasks_editor_read on public.tasks for select to authenticated
  using (org_id = public.current_org_id() and public.can_edit_case(case_id));
create policy tasks_editor_insert on public.tasks for insert to authenticated
  with check (org_id = public.current_org_id() and public.can_edit_case(case_id)
              and created_by = auth.uid() and status = 'open' and role = 'field');
create policy tasks_editor_update on public.tasks for update to authenticated
  using (org_id = public.current_org_id() and public.can_edit_case(case_id))
  with check (org_id = public.current_org_id() and public.can_edit_case(case_id));

-- Field staff may upload proof photos/scans to {org}/{case}/field/ while they hold an open task there.
create or replace function public.has_open_task(c_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
     where t.case_id = c_id and t.assignee_id = auth.uid() and t.org_id = public.current_org_id()
       and t.status in ('open', 'in_progress')
  )
$$;
revoke execute on function public.has_open_task(uuid) from public, anon;
grant execute on function public.has_open_task(uuid) to authenticated;

create policy case_files_field_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'case-files'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (storage.foldername(name))[3] = 'field'
    and array_length(storage.foldername(name), 1) = 3
    and public.has_open_task(public.storage_case_id(name))
  );

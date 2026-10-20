-- Field tasks hardening (security review of 20261022010000):
--  1. after closing, the assignee could still rewrite done_at / created_at / note / proof;
--  2. inserts skipped the proof/done/note checks;
--  3. an admin update could point a task at another office's case or user.
-- Also: tasks_update_own scoped to the office, and field staff see a case only while a
-- task on it is open or in progress.

create or replace function public.guard_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  editable constant text[] := array['status', 'note', 'proof_path', 'updated_at', 'done_at'];
begin
  -- Office isolation, for everyone (admins included), whenever the links are set or changed.
  if tg_op = 'INSERT' or (new.org_id, new.case_id, new.assignee_id, new.role)
                         is distinct from (old.org_id, old.case_id, old.assignee_id, old.role) then
    if not exists (
      select 1 from public.user_roles ur
       where ur.user_id = new.assignee_id and ur.org_id = new.org_id and ur.role = new.role
    ) then
      raise exception 'assignee does not hold that role in this office';
    end if;
    if not exists (select 1 from public.cases c where c.id = new.case_id and c.org_id = new.org_id) then
      raise exception 'case not in this office';
    end if;
  end if;

  if new.proof_path is not null and (tg_op = 'INSERT' or new.proof_path is distinct from old.proof_path)
     and not (public.path_in_case(new.proof_path, new.org_id, new.case_id) and split_part(new.proof_path, '/', 3) = 'field') then
    raise exception 'proof must be stored in the case''s field folder';
  end if;

  if tg_op = 'INSERT' then
    -- A new task starts empty; progress is reported by the assignee.
    if new.note is not null or new.proof_path is not null or new.done_at is not null then
      raise exception 'a new task cannot carry progress';
    end if;
    return new;
  end if;

  -- done_at is the trigger's: set when the task is first marked done, never edited.
  new.done_at := case when new.status = 'done' and old.status <> 'done' then now() else old.done_at end;

  if auth.uid() is not null and not public.has_role('admin') then
    if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
      raise exception 'only progress can be updated on a task' using errcode = 'insufficient_privilege';
    end if;
    if old.status in ('done', 'cancelled')
       and (new.status, new.note, new.proof_path) is distinct from (old.status, old.note, old.proof_path) then
      raise exception 'a closed task cannot be changed' using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' and not public.can_edit_case(old.case_id) then
      raise exception 'the assignee cannot cancel a task' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_task() from public, anon, authenticated;

alter policy tasks_update_own on public.tasks
  using (org_id = public.current_org_id() and assignee_id = auth.uid())
  with check (org_id = public.current_org_id() and assignee_id = auth.uid());

-- Field staff: a case is visible only while they hold an open or in-progress task on it.
create or replace function public.can_see_case(c_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cases c
    where c.id = c_id
      and c.org_id = public.current_org_id()
      and (
        public.has_role('admin')
        or public.has_role('approver')
        or (public.has_role('drafter') and c.assigned_drafter = auth.uid())
        or exists (select 1 from public.tasks t
                    where t.case_id = c.id and t.assignee_id = auth.uid() and t.status in ('open', 'in_progress'))
      )
  )
$$;

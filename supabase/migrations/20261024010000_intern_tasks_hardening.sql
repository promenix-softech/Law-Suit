-- Intern board hardening after security review.
--  * Interns may change only the status: compare the whole row, so new columns are covered too.
--  * A deactivated intern can no longer edit today's update.
--  * No TRUNCATE / REFERENCES / TRIGGER for authenticated on the intern tables.

create or replace function public.guard_intern_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' or public.intern_role() = 'admin' then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'interns can only change the task status' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'todo' and new.status = 'in_progress')
    or (old.status = 'in_progress' and new.status = 'in_review')
    or (old.status = 'in_review' and new.status = 'in_progress')) then
    raise exception 'task cannot move from % to %', old.status, new.status using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.guard_intern_task() from public, anon, authenticated;

alter policy intern_updates_update on public.intern_daily_updates
  using (user_id = auth.uid() and public.intern_role() is not null
         and day = (now() at time zone 'Asia/Kolkata')::date)
  with check (user_id = auth.uid() and public.intern_role() is not null
              and day = (now() at time zone 'Asia/Kolkata')::date);

revoke truncate, references, trigger on public.intern_members, public.intern_tasks,
  public.intern_task_events, public.intern_daily_updates from authenticated;

-- The assigned drafter may update their case (status, claim), but must not change who drafts
-- or approves it, or move it to another organisation: only admins assign. Enforced here
-- because RLS policies cannot restrict individual columns.
create or replace function public.guard_case_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.assigned_drafter is distinct from old.assigned_drafter
      or new.assigned_approver is distinct from old.assigned_approver
      or new.org_id is distinct from old.org_id
      or new.created_by is distinct from old.created_by)
     and auth.uid() is not null
     and not public.has_role('admin') then
    raise exception 'only an admin can change case assignment'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger cases_guard_assignment before update on public.cases
for each row execute function public.guard_case_assignment();

revoke execute on function public.guard_case_assignment() from public, anon, authenticated;

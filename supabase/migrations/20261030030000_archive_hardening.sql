-- Hardening after the security review of the archive / correction round.

-- 1. Archived means read-only on every path, nested triggers included (apply_approval used to slip
--    through). Only the service role and migrations bypass. Archiving and restoring are direct
--    admin updates.
create or replace function public.guard_case_archive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' then
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
    if pg_trigger_depth() > 1 or not public.has_role('admin') then
      raise exception 'only an admin can archive or restore a case' using errcode = 'insufficient_privilege';
    end if;
    if new.archived_at is not null then
      new.archived_by := auth.uid();
      new.archived_at := now();
    end if;
  end if;
  return new;
end $$;

-- 2. Archiving takes the case out of everyone's queue: papers waiting for approval go back to
--    draft and open field tasks are cancelled.
create or replace function public.on_case_archived() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    update public.drafts set status = 'draft' where case_id = new.id and status = 'in_approval';
    update public.tasks set status = 'cancelled' where case_id = new.id and status in ('open', 'in_progress');
  end if;
  return null;
end $$;
create trigger cases_archived_cleanup after update of archived_at on public.cases
for each row execute function public.on_case_archived();
revoke execute on function public.on_case_archived() from public, anon, authenticated;

-- 3. No approval on a paper of an archived case.
create or replace function public.approval_case_active() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.drafts d join public.cases c on c.id = d.case_id
     where d.id = new.draft_id and c.archived_at is not null
  ) then
    raise exception 'this case is archived' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger approvals_case_active before insert on public.approvals
for each row execute function public.approval_case_active();
revoke execute on function public.approval_case_active() from public, anon, authenticated;

-- 4. Field uploads and admin writes to an archived case's documents and tasks are refused too.
create or replace function public.has_open_task(c_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t join public.cases c on c.id = t.case_id
     where t.case_id = c_id and t.assignee_id = auth.uid() and t.org_id = public.current_org_id()
       and t.status in ('open', 'in_progress') and c.archived_at is null
  )
$$;

create or replace function public.refuse_archived_case_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- pg_trigger_depth() < 2: the archive clean-up above (a nested trigger) still closes tasks.
  if current_setting('role', true) = 'authenticated' and pg_trigger_depth() < 2
     and exists (select 1 from public.cases c where c.id = coalesce(new.case_id, old.case_id) and c.archived_at is not null) then
    raise exception 'this case is archived; restore it first' using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end $$;
create trigger documents_not_archived before insert or update or delete on public.documents
for each row execute function public.refuse_archived_case_write();
create trigger tasks_not_archived before insert or update or delete on public.tasks
for each row execute function public.refuse_archived_case_write();
revoke execute on function public.refuse_archived_case_write() from public, anon, authenticated;

-- 5. The plaint (or OA) is locked once it has gone to the notary or the court, whatever the
--    client; a new version of an approved one sends the case back to drafting.
create or replace function public.guard_suit_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st public.case_status;
begin
  if new.doc_kind::text not in ('plaint', 'original_application') or new.current_version is not distinct from old.current_version then
    return new;
  end if;
  select status into st from public.cases where id = new.case_id;
  if current_setting('role', true) = 'authenticated'
     and st in ('notary_stamp', 'efiling_ready', 'filed', 'listed', 'disposed') then
    raise exception 'the plaint has gone to the notary or the court' using errcode = 'insufficient_privilege';
  end if;
  if st = 'approved' then
    update public.cases set status = 'drafting' where id = new.case_id;
  end if;
  return new;
end $$;
create trigger drafts_guard_suit_version before update of current_version on public.drafts
for each row execute function public.guard_suit_version();
revoke execute on function public.guard_suit_version() from public, anon, authenticated;

-- 6. A corrected Word file is recorded only by the person who uploaded it, so its author is the
--    version's author (maker-checker).
create or replace function public.uploaded_by_me(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from storage.objects o
     where o.bucket_id = 'case-files' and o.name = p_path and o.owner = auth.uid()
  )
$$;
revoke execute on function public.uploaded_by_me(text) from public, anon;
grant execute on function public.uploaded_by_me(text) to authenticated;

-- 7. The sign-in page needs a firm's name only.
drop function public.firm_by_code(text);
create function public.firm_by_code(code text) returns text
language sql stable security definer set search_path = '' as $$
  select o.name from public.organizations o
  where o.slug is not null and o.slug = lower(btrim(code))
$$;
revoke execute on function public.firm_by_code(text) from public;
grant execute on function public.firm_by_code(text) to anon, authenticated;

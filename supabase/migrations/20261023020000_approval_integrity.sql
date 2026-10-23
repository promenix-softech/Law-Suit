-- Approval integrity (security audit 2026-10-23).
--  1. Changing which version a draft points at sends it back to 'draft', so an approved draft can
--     never carry content the approver did not see.
--  2. Only the PDF job (service role / complete_doc_job) writes draft_versions.pdf_path.
--  3. Case status moves follow the lifecycle (packages/domain/src/lifecycle.ts); 'approved' is set
--     only by an approval.
--  4. A mediation report path must point at the case's mediation folder and an uploaded object.

-- 1 -------------------------------------------------------------------------------------------
create or replace function public.reset_draft_on_version_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.current_version is distinct from old.current_version and pg_trigger_depth() < 2 then
    new.status := 'draft';
  end if;
  return new;
end $$;
create trigger drafts_reset_on_version before update of current_version on public.drafts
for each row execute function public.reset_draft_on_version_change();
revoke execute on function public.reset_draft_on_version_change() from public, anon, authenticated;

-- 2 -------------------------------------------------------------------------------------------
create or replace function public.guard_draft_pdf_path() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('role', true) = 'authenticated' and pg_trigger_depth() < 2
     and new.pdf_path is not null
     and (tg_op = 'INSERT' or new.pdf_path is distinct from old.pdf_path) then
    raise exception 'pdf_path is written by the document worker only'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger draft_versions_guard_pdf before insert or update of pdf_path on public.draft_versions
for each row execute function public.guard_draft_pdf_path();
revoke execute on function public.guard_draft_pdf_path() from public, anon, authenticated;

-- 3 -------------------------------------------------------------------------------------------
create or replace function public.case_transition_ok(f public.case_status, t public.case_status, needs_12a boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case f
    when 'bank_call'         then t in ('case_created')
    when 'case_created'      then t in ('docs_uploaded')
    when 'docs_uploaded'     then t in ('extraction_review')
    when 'extraction_review' then t in ('notice_generated', 'drafting')
    when 'notice_generated'  then t in ('notice_sent')
    when 'notice_sent'       then t = 'mediation_12a' or (t = 'drafting' and not coalesce(needs_12a, false))
    when 'mediation_12a'     then t in ('drafting')
    when 'drafting'          then t in ('in_approval')
    when 'in_approval'       then t in ('approved', 'drafting')
    when 'approved'          then t in ('notary_stamp')
    when 'notary_stamp'      then t in ('efiling_ready')
    when 'efiling_ready'     then t in ('filed')
    when 'filed'             then t in ('listed')
    when 'listed'            then t in ('disposed')
    else false
  end
$$;

create or replace function public.guard_case_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Service role, migrations and nested triggers (apply_approval) are trusted. The request role
  -- (SET ROLE by PostgREST) is visible here even though this function runs as its owner.
  if current_setting('role', true) is distinct from 'authenticated' or pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status in ('in_approval', 'approved') then
      raise exception 'a new case cannot start as %', new.status using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'approved' then
    raise exception 'case status approved is set only by an approval' using errcode = 'insufficient_privilege';
  end if;
  -- Admins may correct a case's stage; everyone else follows the lifecycle.
  if not public.has_role('admin') and not public.case_transition_ok(old.status, new.status, old.needs_12a) then
    raise exception 'case cannot move from % to %', old.status, new.status using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger cases_guard_status before insert or update of status on public.cases
for each row execute function public.guard_case_status();
revoke execute on function public.guard_case_status() from public, anon, authenticated;

-- 4 -------------------------------------------------------------------------------------------
create or replace function public.mediations_path_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.report_path is null or current_setting('role', true) is distinct from 'authenticated' then
    return new;
  end if;
  if not public.path_in_case(new.report_path, new.org_id, new.case_id)
     or split_part(new.report_path, '/', 3) <> 'mediation'
     or not exists (select 1 from storage.objects o
                    where o.bucket_id = 'case-files' and o.name = new.report_path) then
    raise exception 'mediation report must be an uploaded file in the case mediation folder'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger mediations_path_check before insert or update of report_path, case_id, org_id
on public.mediations for each row execute function public.mediations_path_check();
revoke execute on function public.mediations_path_check() from public, anon, authenticated;

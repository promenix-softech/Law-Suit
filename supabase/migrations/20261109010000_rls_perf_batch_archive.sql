-- 1. RLS speed: ten policies compared a column with auth.uid() directly, so Postgres called the
--    function for every row. Wrapped in a scalar sub-select it is evaluated once per statement.
--    The conditions themselves are unchanged (Supabase advisor "auth_rls_initplan").
-- 2. Indexes on the foreign keys the app joins and filters by. The org_id and created_by /
--    uploaded_by / verified_by keys are left without one on purpose: with a handful of offices
--    an org_id index does not narrow anything, and the user keys are only followed on delete.
-- 3. A bulk-upload split can no longer attach pages to an archived case (archived = read-only on
--    every path; the worker applies the plan with the service role, which the row guards trust).

-- 1 -------------------------------------------------------------------------------------------
alter policy approvals_insert on public.approvals
  with check (org_id = public.current_org_id() and approver_id = (select auth.uid())
              and (public.has_role('approver') or public.has_role('admin')));

alter policy batches_insert on public.batches
  with check (org_id = public.current_org_id() and public.has_role('admin') and created_by = (select auth.uid())
              and status = 'uploaded' and plan is null and attempts = 0 and page_count is null
              and created_cases = '{}'::jsonb and purged_at is null and locked_at is null);

alter policy cases_drafter_update on public.cases
  using (org_id = public.current_org_id() and assigned_drafter = (select auth.uid()))
  with check (org_id = public.current_org_id() and assigned_drafter = (select auth.uid()));

alter policy doc_jobs_insert on public.doc_jobs
  with check (org_id = public.current_org_id() and created_by = (select auth.uid())
              and status = 'queued' and attempts = 0 and output_path is null
              and public.can_edit_case(case_id));

alter policy documents_insert on public.documents
  with check (org_id = public.current_org_id() and uploaded_by = (select auth.uid())
              and (case_id is null or public.can_edit_case(case_id)));

alter policy draft_versions_insert on public.draft_versions
  with check (org_id = public.current_org_id() and created_by = (select auth.uid())
              and exists (select 1 from public.drafts d
                           where d.id = draft_versions.draft_id and public.can_edit_case(d.case_id)));

alter policy ocr_jobs_insert on public.ocr_jobs
  with check (org_id = public.current_org_id() and created_by = (select auth.uid())
              and public.can_edit_case(public.document_case_id(document_id)));

alter policy tasks_editor_insert on public.tasks
  with check (org_id = public.current_org_id() and public.can_edit_case(case_id) and created_by = (select auth.uid())
              and status = 'open' and role = 'field');

alter policy tasks_read on public.tasks
  using (org_id = public.current_org_id() and (assignee_id = (select auth.uid()) or public.has_role('admin')));

alter policy tasks_update_own on public.tasks
  using (org_id = public.current_org_id() and assignee_id = (select auth.uid()))
  with check (org_id = public.current_org_id() and assignee_id = (select auth.uid()));

-- 2 -------------------------------------------------------------------------------------------
create index if not exists approvals_draft_id_idx on public.approvals (draft_id);
create index if not exists bank_branches_bank_id_idx on public.bank_branches (bank_id);
create index if not exists cases_assigned_approver_idx on public.cases (assigned_approver);
create index if not exists cases_bank_branch_id_idx on public.cases (bank_branch_id);
create index if not exists cases_court_id_idx on public.cases (court_id);
create index if not exists drafts_case_id_idx on public.drafts (case_id);
create index if not exists extracted_fields_document_id_idx on public.extracted_fields (document_id);
create index if not exists filings_case_id_idx on public.filings (case_id);
create index if not exists loans_case_id_idx on public.loans (case_id);
create index if not exists mediations_case_id_idx on public.mediations (case_id);
create index if not exists notices_case_id_idx on public.notices (case_id);
create index if not exists tasks_case_id_idx on public.tasks (case_id);
create index if not exists templates_bank_id_idx on public.templates (bank_id);
create index if not exists usage_events_case_id_idx on public.usage_events (case_id);

-- 3 -------------------------------------------------------------------------------------------
-- Same function as in 20261022000000_batches, with one more condition: an existing case that a
-- group joins must not be archived.
create or replace function public.confirm_batch(p_batch uuid, p_plan jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.batches;
  g jsonb;
  seen int[] := '{}';
  pg int;
begin
  if not public.has_role('admin') then
    raise exception 'only an admin can confirm a split' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.batches where id = p_batch and org_id = public.current_org_id() for update;
  if not found or b.status <> 'review' or b.page_count is null then raise exception 'batch is not waiting for review'; end if;
  if jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) not between 1 and 200 then
    raise exception 'plan must list 1–200 groups';
  end if;
  for g in select * from jsonb_array_elements(p_plan) loop
    if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g -> 'pages') is distinct from 'array'
       or jsonb_array_length(g -> 'pages') = 0 then
      raise exception 'each group needs pages';
    end if;
    if (g ->> 'case_id') is not null then
      if not exists (select 1 from public.cases
                      where id = (g ->> 'case_id')::uuid and org_id = b.org_id and archived_at is null) then
        raise exception 'case not in this office, or archived';
      end if;
    elsif coalesce(g ->> 'case_no', '') !~ '^[A-Za-z0-9/_-]{1,40}$'
          or exists (select 1 from public.cases where org_id = b.org_id and case_no_internal = g ->> 'case_no') then
      raise exception 'new case number missing, invalid or already used';
    end if;
    for pg in select (jsonb_array_elements_text(g -> 'pages'))::int loop
      if pg < 1 or pg > b.page_count or pg = any(seen) then raise exception 'page % is invalid or repeated', pg; end if;
      seen := seen || pg;
    end loop;
  end loop;
  if cardinality(seen) <> b.page_count then raise exception 'every page must be assigned'; end if;
  if (select count(distinct x ->> 'case_no') from jsonb_array_elements(p_plan) x where x ->> 'case_id' is null)
     <> (select count(*) from jsonb_array_elements(p_plan) x where x ->> 'case_id' is null) then
    raise exception 'new case numbers must differ';
  end if;
  update public.batches set status = 'applying', plan = p_plan, attempts = 0, error = null where id = p_batch;
end $$;

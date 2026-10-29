-- RLS + constraint tests. Run with scripts/test-db.sh. Synthetic data only.
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- fixtures (as superuser)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'drafter1@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'drafter2@example.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'approver@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'field@example.test'),
  ('00000000-0000-0000-0000-0000000000b9', 'other-org@example.test');

insert into public.organizations (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Demo Advocates'),
  ('22222222-2222-2222-2222-222222222222', 'Other Office');

insert into public.profiles (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Admin'),
  ('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'Drafter One'),
  ('00000000-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-111111111111', 'Drafter Two'),
  ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Approver'),
  ('00000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'Field'),
  ('00000000-0000-0000-0000-0000000000b9', '22222222-2222-2222-2222-222222222222', 'Outsider');

insert into public.user_roles (user_id, org_id, role) values
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'drafter'),
  ('00000000-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-111111111111', 'drafter'),
  ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'approver'),
  ('00000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'field'),
  ('00000000-0000-0000-0000-0000000000b9', '22222222-2222-2222-2222-222222222222', 'admin');

insert into public.cases (id, org_id, case_no_internal, assigned_drafter, created_by) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CS-1',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'CS-2',
   '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000000a');

insert into public.tasks (org_id, case_id, assignee_id, role, kind) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000f1', 'field', 'notary');

insert into public.drafts (id, org_id, case_id, doc_kind, language, created_by, status) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'plaint', 'en', '00000000-0000-0000-0000-0000000000d1', 'in_approval');
update public.cases set status = 'in_approval' where id = 'c0000000-0000-0000-0000-000000000001';

create or replace function pg_temp.act_as(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- ---------------------------------------------------------------- tests
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((select count(*) from public.cases) = 1, 'drafter sees only assigned case');
select pg_temp.expect((select count(*) from public.cases where case_no_internal = 'CS-2') = 0,
                      'drafter cannot read another drafter''s case');
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.cases) = 2, 'admin sees all org cases');
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b9');
select pg_temp.expect((select count(*) from public.cases) = 0, 'other org sees no cases');
select pg_temp.expect((select count(*) from public.organizations) = 1, 'other org sees only own org');
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from public.tasks) = 1, 'field sees own task');
select pg_temp.expect((select count(*) from public.cases) = 1, 'field sees only case with own task');
select pg_temp.expect((select count(*) from public.drafts) = 0, 'field sees no drafts of other cases');
rollback;

-- maker-checker: drafter1 holds approver role too, still cannot approve own draft
insert into public.user_roles (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'approver');

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    insert into public.approvals (org_id, draft_id, decision)
    values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'approved');
    raise exception 'FAIL: author approved own draft';
  exception when check_violation then
    raise notice 'ok - approver cannot approve own draft';
  end;
  reset role;
end $$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  begin
    insert into public.approvals (org_id, draft_id, decision)
    values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'approved');
    raise exception 'FAIL: non-approver approved';
  exception when insufficient_privilege then
    raise notice 'ok - drafter without approver role cannot approve';
  end;
  reset role;
end $$;

-- the author cannot mark their own draft approved by a direct update
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    update public.drafts set status = 'approved' where id = 'd0000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: draft approved by direct update';
  exception when insufficient_privilege then
    raise notice 'ok - draft cannot be approved by direct update';
  end;
  reset role;
end $$;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.approvals (org_id, draft_id, decision)
values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'approved');
select pg_temp.expect(true, 'independent approver can approve');
commit;

select pg_temp.expect(
  (select status from public.drafts where id = 'd0000000-0000-0000-0000-000000000001') = 'approved',
  'approval marks the draft approved');
select pg_temp.expect(
  (select status from public.cases where id = 'c0000000-0000-0000-0000-000000000001') = 'approved',
  'approved plaint moves the case to approved');

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  begin
    insert into public.approvals (org_id, draft_id, decision)
    values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'returned');
    raise exception 'FAIL: decision accepted on a draft not awaiting approval';
  exception when check_violation then
    raise notice 'ok - no decision on a draft not awaiting approval';
  end;
  reset role;
end $$;

-- audit log: populated, chained, append-only
select pg_temp.expect((select count(*) from public.audit_log where entity = 'cases' and action = 'insert') = 2, 'case inserts audited');
select pg_temp.expect(
  (select count(*) from public.audit_log where entity = 'approvals') = 1, 'approval decision audited');
select pg_temp.expect(
  (select bool_and(a.prev_hash = coalesce(b.row_hash, ''))
     from public.audit_log a
     left join lateral (select row_hash from public.audit_log x
                        where x.org_id = a.org_id and x.id < a.id order by x.id desc limit 1) b on true),
  'audit hash chain is intact');

do $$
begin
  begin
    update public.audit_log set action = 'tampered';
    raise exception 'FAIL: audit_log updated';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok - audit_log rejects update (even superuser)';
  end;
end $$;

-- assignment constraint
do $$
begin
  begin
    insert into public.cases (org_id, case_no_internal, assigned_drafter, assigned_approver, created_by)
    values ('11111111-1111-1111-1111-111111111111', 'CS-X', '00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: same drafter and approver allowed';
  exception when check_violation then
    raise notice 'ok - case cannot assign same user as drafter and approver';
  end;
end $$;

-- storage: case files follow case visibility
insert into storage.objects (bucket_id, name) values
  ('case-files', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/scans/a.pdf'),
  ('case-files', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/scans/b.pdf');

-- drafter2 holds only the drafter role (drafter1 was given approver above)
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
select pg_temp.expect((select count(*) from storage.objects) = 1, 'drafter sees only files of assigned case');
insert into storage.objects (bucket_id, name)
values ('case-files', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/scans/c.pdf');
select pg_temp.expect(true, 'drafter can upload to assigned case');
rollback;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name)
    values ('case-files', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/scans/x.pdf');
    raise exception 'FAIL: drafter uploaded to another drafter''s case';
  exception when insufficient_privilege then
    raise notice 'ok - drafter cannot upload to unassigned case';
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('case-files', 'not-a-uuid/whatever/x.pdf');
    raise exception 'FAIL: malformed path accepted';
  exception when insufficient_privilege then
    raise notice 'ok - malformed storage path rejected';
  end;
  reset role;
end $$;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b9');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'other org sees no case files');
rollback;

-- OCR: jobs and page text follow the document's case
insert into public.documents (id, org_id, case_id, storage_path, sha256, uploaded_by) values
  ('e0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/scans/b.pdf', repeat('0', 64), '00000000-0000-0000-0000-0000000000d2');

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
insert into public.ocr_jobs (org_id, document_id, provider_job_id, language)
values ('11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000002', 'job-1', 'en-IN');
insert into public.document_pages (org_id, document_id, page_no, ocr_text_enc)
values ('11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000002', 1, '\x00');
select pg_temp.expect((select count(*) from public.document_pages) = 1, 'assigned drafter records OCR job and page text');
rollback;

do $$
begin
  -- drafter1 is drafter of case 1 and approver; case 2 is not theirs to edit
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    insert into public.ocr_jobs (org_id, document_id, provider_job_id, language)
    values ('11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000002', 'job-2', 'en-IN');
    raise exception 'FAIL: non-editor started OCR';
  exception when insufficient_privilege then
    raise notice 'ok - only the case editor can start OCR';
  end;
  begin
    insert into public.document_pages (org_id, document_id, page_no)
    values ('11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000002', 9);
    raise exception 'FAIL: non-editor wrote page text';
  exception when insufficient_privilege then
    raise notice 'ok - only the case editor can write page text';
  end;
  reset role;
end $$;

-- assignment: the drafter cannot pick their own approver; the admin can re-assign
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  begin
    update public.cases set assigned_approver = '00000000-0000-0000-0000-0000000000f1'
     where id = 'c0000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: drafter changed the approver';
  exception when insufficient_privilege then
    raise notice 'ok - drafter cannot change case assignment';
  end;
  update public.cases set claim_amount_paise = 12345 where id = 'c0000000-0000-0000-0000-000000000002';
  if not found then raise exception 'FAIL: drafter could not update own case'; end if;
  raise notice 'ok - drafter can still update other case fields';
  reset role;
end $$;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update public.cases set assigned_approver = '00000000-0000-0000-0000-0000000000a1'
 where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.expect(
  (select assigned_approver from public.cases where id = 'c0000000-0000-0000-0000-000000000002')
    = '00000000-0000-0000-0000-0000000000a1',
  'admin can re-assign a case');
rollback;

-- audit chain verification: intact for admin, refused for others
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select first_broken_id is null and rows_checked > 0 from public.verify_audit_chain()),
                      'audit chain verifies intact for admin');
rollback;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  begin
    perform public.verify_audit_chain();
    raise exception 'FAIL: non-admin verified audit chain';
  exception when insufficient_privilege then
    raise notice 'ok - only admins can verify the audit chain';
  end;
  reset role;
end $$;

-- tamper with one row (as superuser, bypassing the immutability trigger) and expect detection
alter table public.audit_log disable trigger audit_log_no_update;
update public.audit_log set action = 'tampered'
  where id = (select min(id) + 1 from public.audit_log where org_id = '11111111-1111-1111-1111-111111111111');
alter table public.audit_log enable trigger audit_log_no_update;
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select first_broken_id is not null from public.verify_audit_chain()), 'tampered audit row is detected');
rollback;

-- document jobs: editors enqueue, only the worker (service_role) runs them
insert into public.drafts (id, org_id, case_id, doc_kind, language, created_by) values
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000002', 'plaint', 'en', '00000000-0000-0000-0000-0000000000d2');
insert into public.draft_versions (id, org_id, draft_id, version, docx_path, created_by) values
  ('f0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000002', 1,
   '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/drafts/p.docx',
   '00000000-0000-0000-0000-0000000000d2');
insert into public.draft_versions (id, org_id, draft_id, version, docx_path, created_by) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', 1, '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/drafts/q.docx', '00000000-0000-0000-0000-0000000000d1');

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
insert into public.doc_jobs (id, org_id, case_id, kind, payload) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000002', 'draft_pdf', '{"draft_version_id":"f0000000-0000-0000-0000-000000000002"}');
select pg_temp.expect((select count(*) from public.doc_jobs) = 1, 'assigned drafter queues a PDF job');
update public.doc_jobs set status = 'done', output_path = 'x' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.expect((select status from public.doc_jobs) = 'queued', 'users cannot change job state');
reset role;
set local role service_role;
select pg_temp.expect((select count(*) from public.claim_doc_job()) = 1, 'worker claims the queued job');
select pg_temp.expect((select count(*) from public.claim_doc_job()) = 0, 'a claimed job is not handed out twice');
select public.complete_doc_job('a0000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/drafts/p.pdf', '{}');
select pg_temp.expect(
  (select pdf_path from public.draft_versions where id = 'f0000000-0000-0000-0000-000000000002') like '%/p.pdf',
  'completed PDF job sets the draft version PDF');
rollback;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    insert into public.doc_jobs (org_id, case_id, kind, payload) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'draft_pdf',
       '{"draft_version_id":"f0000000-0000-0000-0000-000000000002"}');
    raise exception 'FAIL: non-editor queued a job';
  exception when insufficient_privilege then
    raise notice 'ok - only the case editor can queue jobs';
  end;
  begin
    insert into public.doc_jobs (org_id, case_id, kind, payload) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'draft_pdf',
       '{"draft_version_id":"f0000000-0000-0000-0000-000000000002"}');
    raise exception 'FAIL: job pointed at another case''s draft';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok - a job cannot point at another case''s draft';
  end;
  begin
    perform public.claim_doc_job();
    raise exception 'FAIL: user claimed a job';
  exception when insufficient_privilege then
    raise notice 'ok - only the worker can claim jobs';
  end;
  reset role;
end $$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  begin
    insert into public.doc_jobs (org_id, case_id, kind, payload) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'efiling_bundle', '{}');
    raise exception 'FAIL: bundle before approval';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok - no e-filing bundle before the plaint is approved';
  end;
  reset role;
end $$;

begin;
update public.cases set status = 'approved' where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
insert into public.doc_jobs (org_id, case_id, kind, payload) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'efiling_bundle',
   '{"annexures":[{"document_id":"e0000000-0000-0000-0000-000000000002","title":"Loan agreement"}]}');
select pg_temp.expect((select count(*) from public.doc_jobs where kind = 'efiling_bundle') = 1,
  'approved case: drafter queues the e-filing bundle');
do $$
begin
  insert into public.doc_jobs (org_id, case_id, kind, payload) values
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'efiling_bundle',
     '{"annexures":[{"document_id":"e0000000-0000-0000-0000-000000000001","title":"Other"}]}');
  raise exception 'FAIL: foreign annexure accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - annexures must be this case''s documents';
end $$;
rollback;

begin;
insert into public.doc_jobs (id, org_id, case_id, kind, payload, created_by) values
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000002', 'draft_pdf', '{"draft_version_id":"f0000000-0000-0000-0000-000000000002"}',
   '00000000-0000-0000-0000-0000000000d2');
set local role service_role;
select count(*) from public.claim_doc_job();
do $$
begin
  perform public.complete_doc_job('a0000000-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222/c0000000-0000-0000-0000-000000000002/drafts/p.pdf', '{}');
  raise exception 'FAIL: output outside the case folder';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - job output must stay in the case folder';
end $$;
select public.fail_doc_job('a0000000-0000-0000-0000-000000000002', 'boom');
select pg_temp.expect((select status from public.doc_jobs where id = 'a0000000-0000-0000-0000-000000000002') = 'queued',
  'a failed attempt is retried');
rollback;

-- storage paths: a row can only point inside its own case folder (the worker reads with the service role)
do $$
declare
  bad text[] := array[
    '22222222-2222-2222-2222-222222222222/c0000000-0000-0000-0000-000000000002/scans/x.pdf',
    '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/scans/x.pdf',
    '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/../c0000000-0000-0000-0000-000000000001/x.pdf',
    '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/x.pdf'
  ];
  p text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  foreach p in array bad loop
    begin
      insert into public.documents (org_id, case_id, storage_path, sha256) values
        ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', p, repeat('0', 64));
      raise exception 'FAIL: document path % accepted', p;
    exception when raise_exception then
      if sqlerrm like 'FAIL%' then raise; end if;
    end;
    begin
      insert into public.draft_versions (org_id, draft_id, version, docx_path) values
        ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000002', 9, p);
      raise exception 'FAIL: draft path % accepted', p;
    exception when raise_exception then
      if sqlerrm like 'FAIL%' then raise; end if;
    end;
  end loop;
  raise notice 'ok - document and draft paths must stay inside their case folder';
  reset role;
end $$;

-- the worker functions are closed to users and anon; anon cannot touch jobs
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  begin
    perform public.complete_doc_job('a0000000-0000-0000-0000-000000000001', 'x', '{}');
    raise exception 'FAIL: admin completed a job';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fail_doc_job('a0000000-0000-0000-0000-000000000001', 'x');
    raise exception 'FAIL: admin failed a job';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok - even admins cannot complete or fail jobs';
  reset role;
  set local role anon;
  begin
    perform 1 from public.doc_jobs;
    raise exception 'FAIL: anon read jobs';
  exception when insufficient_privilege then
    raise notice 'ok - anon cannot read jobs';
  end;
  reset role;
end $$;

-- cross-org: the other office cannot queue work on this office's case
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
  set local role authenticated;
  begin
    insert into public.doc_jobs (org_id, case_id, kind, payload) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'draft_pdf',
       '{"draft_version_id":"f0000000-0000-0000-0000-000000000002"}');
    raise exception 'FAIL: other org queued a job';
  exception when insufficient_privilege or check_violation then
    raise notice 'ok - another org cannot queue jobs on this case';
  end;
  reset role;
end $$;

-- users cannot plant output or error text on insert; a second active PDF job is refused
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
insert into public.doc_jobs (org_id, case_id, kind, payload, output_meta, error) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'draft_pdf',
   '{"draft_version_id":"f0000000-0000-0000-0000-000000000002"}', '{"fileName":"fake.pdf"}', 'planted');
select pg_temp.expect((select output_meta = '{}' and error is null from public.doc_jobs), 'job state columns start clean');
do $$
begin
  insert into public.doc_jobs (org_id, case_id, kind, payload) values
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'draft_pdf',
     '{"draft_version_id":"f0000000-0000-0000-0000-000000000002"}');
  raise exception 'FAIL: duplicate active job';
exception when unique_violation then
  raise notice 'ok - one active job per draft version';
end $$;
rollback;

-- billing: usage rows that feed invoices cannot be forged by app users
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  begin
    insert into public.usage_events (org_id, case_id, kind, qty) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'suit_pack', 1);
    raise exception 'FAIL: user logged a suit pack';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.usage_events (org_id, case_id, kind, qty) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'ocr_page', -5);
    raise exception 'FAIL: negative usage accepted';
  exception when insufficient_privilege then null;
  end;
  insert into public.usage_events (org_id, case_id, kind, qty) values
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'ocr_page', 3);
  raise notice 'ok - users log only positive OCR/LLM usage';
  reset role;
end $$;

insert into public.usage_events (org_id, case_id, kind, qty, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'suit_pack', 1, '2026-10-05T06:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'suit_pack', 1, '2026-10-09T06:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'suit_pack', 1, '2026-09-30T20:00:00Z');
insert into public.invoices (id, org_id, invoice_no, fy, period_start, period_end, lines, taxable_paise, cgst_paise, sgst_paise, total_paise)
values ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PS/2026-27/0001', '2026-27',
        '2026-10-01', '2026-10-31', '[]', 10000000, 900000, 900000, 11800000);

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.invoices) = 1, 'admin reads own invoices');
-- case 2's first pack is 1 Oct 01:30 IST; case 1 counts once despite two bundles
select pg_temp.expect(public.billable_suit_packs('11111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-31') = 2,
  'one billable suit pack per case, by IST month');
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
select pg_temp.expect((select count(*) from public.invoices) = 0 and (select count(*) from public.billing_plans) = 0,
  'non-admins see no invoices or plans');
select pg_temp.expect(public.billable_suit_packs('11111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-31') = 0,
  'non-admins cannot count billable packs');
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b9');
select pg_temp.expect((select count(*) from public.invoices) = 0, 'other org sees no invoices');
select pg_temp.expect(public.billable_suit_packs('11111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-31') = 0,
  'other org cannot count our packs');
rollback;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  begin
    insert into public.invoices (org_id, invoice_no, fy, period_start, period_end, lines, taxable_paise, total_paise)
    values ('11111111-1111-1111-1111-111111111111', 'X/1', '2026-27', '2026-11-01', '2026-11-30', '[]', 0, 0);
    raise exception 'FAIL: admin wrote an invoice';
  exception when insufficient_privilege then
    raise notice 'ok - app users cannot write invoices';
  end;
  reset role;
end $$;

do $$
begin
  begin
    update public.invoices set total_paise = 1, taxable_paise = 1, cgst_paise = 0, sgst_paise = 0
     where id = 'b1000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: invoice amount changed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    delete from public.invoices where id = 'b1000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: invoice deleted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.invoices set status = 'paid', paid_at = now(), payment_ref = 'NEFT-DEMO'
   where id = 'b1000000-0000-0000-0000-000000000001';
  raise notice 'ok - invoice amounts are immutable, payment status can be recorded';
end $$;

-- deleting a billed case does not remove its suit pack from the bill
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
delete from public.cases where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.expect(public.billable_suit_packs('11111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-31') = 2,
  'a deleted case still counts as billed');
rollback;

-- the worker's service-role path counts packs; admins cannot change plans, invoices or usage
begin;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select pg_temp.expect(public.billable_suit_packs('11111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-31') = 2,
  'service role counts billable packs');
rollback;

do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  begin
    insert into public.billing_plans (org_id, effective_from, slabs, recipient_state)
    values ('11111111-1111-1111-1111-111111111111', '2026-01-01', '[{"upTo":null,"ratePaise":1}]', '27');
    raise exception 'FAIL: admin wrote a plan';
  exception when insufficient_privilege then null;
  end;
  update public.invoices set status = 'cancelled' where id = 'b1000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: admin updated an invoice'; end if;
  update public.usage_events set qty = 0;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user updated usage'; end if;
  delete from public.usage_events;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user deleted usage'; end if;
  raise notice 'ok - app users cannot change plans, invoices or usage';
  reset role;
end $$;

-- invoice status only moves forward
do $$
begin
  update public.invoices set status = 'issued' where id = 'b1000000-0000-0000-0000-000000000001';
  raise exception 'FAIL: paid invoice went back to issued';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - invoice status cannot go backwards';
end $$;
do $$
begin
  update public.invoices set payment_ref = 'OTHER' where id = 'b1000000-0000-0000-0000-000000000001';
  raise exception 'FAIL: payment reference rewritten';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - payment details are recorded once';
end $$;

-- case export: admins only
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  begin
    insert into public.doc_jobs (org_id, case_id, kind) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'case_export');
    raise exception 'FAIL: drafter exported a case';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok - only admins can export a case';
  end;
  reset role;
end $$;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.doc_jobs (org_id, case_id, kind) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'case_export');
select pg_temp.expect((select count(*) from public.doc_jobs where kind = 'case_export') = 1, 'admin queues a case export');
rollback;

insert into storage.objects (bucket_id, name) values
  ('case-exports', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/exports/j/CS-2_export.zip');
begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'case-exports') = 1, 'admin can read case exports');
rollback;
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'case-exports') = 0,
  'the assigned drafter cannot read case exports');
rollback;
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b9');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'case-exports') = 0,
  'another org''s admin cannot read case exports');
rollback;
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name) values
      ('case-exports', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/exports/x/y.zip');
    raise exception 'FAIL: user wrote to case-exports';
  exception when insufficient_privilege then
    raise notice 'ok - only the worker writes case exports';
  end;
  reset role;
end $$;

-- bulk intake (batches): admin only; the confirmed split must use every page once
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    insert into public.batches (id, org_id, storage_path, sha256) values
      ('ba000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
       '11111111-1111-1111-1111-111111111111/ba000000-0000-0000-0000-000000000009/x.pdf', repeat('0', 64));
    raise exception 'FAIL: drafter created a batch';
  exception when insufficient_privilege then
    raise notice 'ok - only admins start a bulk intake';
  end;
  reset role;
end $$;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.batches (id, org_id, storage_path, sha256) values
  ('ba000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111/ba000000-0000-0000-0000-000000000001/scan.pdf', repeat('0', 64));
reset role;
-- worker: claim, then write pages and move to review
set local role service_role;
select pg_temp.expect((select count(*) from public.claim_batch()) = 1, 'worker claims the uploaded batch');
reset role;
update public.batches set status = 'review', page_count = 4 where id = 'ba000000-0000-0000-0000-000000000001';
insert into public.batch_pages (org_id, batch_id, page_no, class, group_no)
select '11111111-1111-1111-1111-111111111111', 'ba000000-0000-0000-0000-000000000001', g, 'other', 1 from generate_series(1, 4) g;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.batch_pages) = 4, 'admin sees the proposed pages');
do $$
begin
  begin
    perform public.confirm_batch('ba000000-0000-0000-0000-000000000001', '[{"pages":[1,2,3],"case_no":"NEW-1"}]');
    raise exception 'FAIL: page left out';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.confirm_batch('ba000000-0000-0000-0000-000000000001', '[{"pages":[1,2],"case_no":"NEW-1"},{"pages":[2,3,4],"case_no":"NEW-2"}]');
    raise exception 'FAIL: page used twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.confirm_batch('ba000000-0000-0000-0000-000000000001', '[{"pages":[1,2,3,4],"case_no":"CS-1"}]');
    raise exception 'FAIL: duplicate case number accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'ok - a split must use every page once and new case numbers must be free';
end $$;
select public.confirm_batch('ba000000-0000-0000-0000-000000000001',
  '[{"pages":[1,2],"case_no":"NEW-1"},{"pages":[3,4],"case_id":"c0000000-0000-0000-0000-000000000002"}]');
select pg_temp.expect((select status from public.batches) = 'applying', 'admin confirms a valid split');
rollback;

-- batches: isolation between offices, and no direct edits of plan/status
insert into public.cases (id, org_id, case_no_internal, created_by) values
  ('c2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'OTHER-1',
   '00000000-0000-0000-0000-0000000000b9');
insert into public.batches (id, org_id, storage_path, sha256, status, page_count, created_by) values
  ('ba000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111/ba000000-0000-0000-0000-000000000002/scan.pdf', repeat('0', 64),
   'review', 2, '00000000-0000-0000-0000-00000000000a');
insert into public.batch_pages (org_id, batch_id, page_no, class, group_no) values
  ('11111111-1111-1111-1111-111111111111', 'ba000000-0000-0000-0000-000000000002', 1, 'other', 1),
  ('11111111-1111-1111-1111-111111111111', 'ba000000-0000-0000-0000-000000000002', 2, 'other', 1);
insert into storage.objects (bucket_id, name) values
  ('case-batches', '11111111-1111-1111-1111-111111111111/ba000000-0000-0000-0000-000000000002/scan.pdf');

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b9');
select pg_temp.expect(
  (select count(*) from public.batches) = 0 and (select count(*) from public.batch_pages) = 0
  and (select count(*) from storage.objects where bucket_id = 'case-batches') = 0,
  'another office sees none of our batches, pages or scans');
do $$
begin
  perform public.confirm_batch('ba000000-0000-0000-0000-000000000002', '[{"pages":[1,2],"case_no":"X-1"}]');
  raise exception 'FAIL: other office confirmed our batch';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - another office cannot confirm our batch';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
do $$
declare n int;
begin
  update public.batches set status = 'applying', plan = '[{"pages":[1,2],"case_no":"X"}]'
   where id = 'ba000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: admin edited a batch plan directly'; end if;
  begin
    perform public.confirm_batch('ba000000-0000-0000-0000-000000000002',
      '[{"pages":[1,2],"case_id":"c2000000-0000-0000-0000-000000000001"}]');
    raise exception 'FAIL: plan attached pages to another office''s case';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.confirm_batch('ba000000-0000-0000-0000-000000000002',
      '[{"case_id":"c0000000-0000-0000-0000-000000000002"},{"pages":[1,2],"case_no":"X-2"}]');
    raise exception 'FAIL: group without pages accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'ok - plans go only through confirm_batch, within the office, every group with pages';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'case-batches') = 0,
  'drafters cannot read bulk scans');
rollback;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    perform public.claim_batch();
    raise exception 'FAIL: user claimed a batch';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.confirm_batch('ba000000-0000-0000-0000-000000000001', '[]');
    raise exception 'FAIL: drafter confirmed a split';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values
      ('case-batches', '11111111-1111-1111-1111-111111111111/ba000000-0000-0000-0000-000000000001/x.pdf');
    raise exception 'FAIL: drafter uploaded a batch file';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok - non-admins cannot claim, confirm or upload batches';
  reset role;
end $$;

-- field tasks: the assignee updates progress only; re-pointing a task to another case is refused
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  set local role authenticated;
  begin
    update public.tasks set case_id = 'c0000000-0000-0000-0000-000000000001'
     where assignee_id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FAIL: field user moved a task to another case';
  exception when insufficient_privilege then
    raise notice 'ok - field user cannot re-point a task to another case';
  end;
  reset role;
end $$;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
update public.tasks set status = 'done', note = 'Notarised at Pune' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.expect((select done_at is not null and note = 'Notarised at Pune' from public.tasks
                        where assignee_id = '00000000-0000-0000-0000-0000000000f1'), 'field user completes a task with a note');
do $$
begin
  update public.tasks set status = 'open' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
  raise exception 'FAIL: closed task reopened';
exception when insufficient_privilege then
  raise notice 'ok - a closed task cannot be reopened by the assignee';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
do $$
begin
  update public.tasks set proof_path = '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/scans/x.jpg'
   where assignee_id = '00000000-0000-0000-0000-0000000000f1';
  raise exception 'FAIL: proof outside field folder';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - proof must sit in the case field folder';
end $$;
insert into storage.objects (bucket_id, name) values
  ('case-files', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/field/proof.jpg');
select pg_temp.expect(true, 'field user uploads proof for a case they have a task on');
do $$
begin
  insert into storage.objects (bucket_id, name) values
    ('case-files', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/field/proof.jpg');
  raise exception 'FAIL: field upload to a case without a task';
exception when insufficient_privilege then
  raise notice 'ok - no field upload without an open task on the case';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
insert into public.tasks (org_id, case_id, assignee_id, role, kind, instructions) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000f1', 'field', 'collect_docs', 'Collect original sanction letter');
select pg_temp.expect((select count(*) from public.tasks where kind = 'collect_docs') = 1, 'case drafter assigns a field task');
do $$
begin
  insert into public.tasks (org_id, case_id, assignee_id, role, kind) values
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002',
     '00000000-0000-0000-0000-0000000000d1', 'field', 'notary');
  raise exception 'FAIL: task given to a non-field user';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - tasks go only to field staff';
end $$;
rollback;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    insert into public.tasks (org_id, case_id, assignee_id, role, kind) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-0000000000f1', 'field', 'notary');
    raise exception 'FAIL: non-editor assigned a task';
  exception when insufficient_privilege then
    raise notice 'ok - only the case editor assigns tasks';
  end;
  reset role;
end $$;

-- field tasks hardening
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
update public.tasks set status = 'done', note = 'Done' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
do $$
begin
  -- done_at belongs to the trigger: an attempt to change it is ignored
  update public.tasks set done_at = '2020-01-01' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
  if (select done_at < '2026-01-01' from public.tasks where assignee_id = '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'FAIL: done_at rewritten';
  end if;
  begin
    update public.tasks set created_at = '2019-01-01' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FAIL: created_at rewritten';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tasks set note = 'edited after close' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FAIL: note changed on a closed task';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok - a closed task''s record cannot be rewritten';
end $$;
select pg_temp.expect((select count(*) from public.cases) = 0, 'field staff lose sight of a case once its task is done');
do $$
begin
  insert into storage.objects (bucket_id, name) values
    ('case-files', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/field/late.jpg');
  raise exception 'FAIL: upload after the task closed';
exception when insufficient_privilege then
  raise notice 'ok - no field upload after the task is closed';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
do $$
begin
  update public.tasks set status = 'cancelled' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
  raise exception 'FAIL: assignee cancelled';
exception when insufficient_privilege then
  raise notice 'ok - the assignee cannot cancel a task';
end $$;
do $$
begin
  insert into storage.objects (bucket_id, name) values
    ('case-files', '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/field/sub/x.jpg');
  raise exception 'FAIL: nested field upload';
exception when insufficient_privilege then
  raise notice 'ok - field uploads only directly in field/';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
do $$
begin
  insert into public.tasks (org_id, case_id, assignee_id, role, kind, proof_path, done_at) values
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002',
     '00000000-0000-0000-0000-0000000000f1', 'field', 'notary',
     '22222222-2222-2222-2222-222222222222/x/../y.pdf', '2000-01-01');
  raise exception 'FAIL: task inserted with progress';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - a new task cannot carry proof or completion';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
do $$
begin
  update public.tasks set case_id = 'c2000000-0000-0000-0000-000000000001'
   where assignee_id = '00000000-0000-0000-0000-0000000000f1';
  raise exception 'FAIL: admin linked a task to another office';
exception when check_violation then
  raise notice 'ok - even an admin cannot link a task to another office';
when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - even an admin cannot link a task to another office';
end $$;
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b9');
select pg_temp.expect((select count(*) from public.tasks) = 0, 'another office sees none of our tasks');
rollback;

-- AI spend guard
begin;
insert into public.ocr_jobs (org_id, document_id, provider_job_id, language, created_by)
select '11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000002', 'rl-' || g, 'en-IN',
       '00000000-0000-0000-0000-0000000000d2'
from generate_series(1, 3) g;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
select pg_temp.expect(public.ai_quota_ok(5, 100) and not public.ai_quota_ok(3, 100) and not public.ai_quota_ok(5, 3),
  'AI quota counts per user per hour and per org per day');
rollback;

-- approval integrity: an approved draft cannot be re-pointed at unapproved content
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.draft_versions (org_id, draft_id, version, docx_path) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 9,
   '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/drafts/v9.docx');
update public.drafts set current_version = 9 where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.expect(
  (select status from public.drafts where id = 'd0000000-0000-0000-0000-000000000001') = 'draft',
  'switching an approved draft to a new version sends it back to draft');
rollback;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    insert into public.draft_versions (org_id, draft_id, version, docx_path, pdf_path) values
      ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 10,
       '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/drafts/v10.docx',
       '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/drafts/forged.pdf');
    raise exception 'FAIL: drafter supplied a PDF for a draft version';
  exception when insufficient_privilege then
    raise notice 'ok - only the worker writes draft PDFs';
  end;
  reset role;
end $$;

-- case status follows the lifecycle; approved only through an approval
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  set local role authenticated;
  begin
    update public.cases set status = 'approved' where id = 'c0000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: drafter set case approved directly';
  exception when insufficient_privilege then
    raise notice 'ok - case approved only through an approval';
  end;
  begin
    update public.cases set status = 'filed' where id = 'c0000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: drafter skipped lifecycle stages';
  exception when check_violation then
    raise notice 'ok - drafter cannot skip lifecycle stages';
  end;
  reset role;
end $$;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
update public.cases set status = 'notary_stamp' where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.expect(
  (select status from public.cases where id = 'c0000000-0000-0000-0000-000000000001') = 'notary_stamp',
  'drafter can take the next lifecycle step');
rollback;

-- mediation report must be an uploaded file in the case mediation folder
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    insert into public.mediations (org_id, case_id, authority, report_path) values
      ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'DLSA',
       '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000001/mediation/never-uploaded.pdf');
    raise exception 'FAIL: mediation report path without an uploaded file';
  exception when check_violation then
    raise notice 'ok - mediation report must exist in the mediation folder';
  end;
  reset role;
end $$;

-- field task text never carries identifiers (the field app writes through the API)
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  set local role authenticated;
  begin
    update public.tasks set note = 'Paid, receipt 98765 43210 1' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FAIL: task note with a 10+ digit number accepted';
  exception when check_violation then
    raise notice 'ok - task notes cannot carry account or phone numbers';
  end;
  begin
    update public.tasks set note = 'PAN abcde1234f seen' where assignee_id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FAIL: task note with a PAN accepted';
  exception when check_violation then
    raise notice 'ok - task notes cannot carry a PAN';
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------- tenant isolation (multi-office)
-- Links must stay inside one office, even for writes that bypass RLS (service role / worker).
begin;
insert into public.courts (id, org_id, name, district, court_type, state) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Demo Court', 'Pune', 'civil', 'MH');
do $$
begin
  begin
    insert into public.cases (org_id, case_no_internal, court_id) values
      ('22222222-2222-2222-2222-222222222222', 'OTHER-1', 'c1000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: case linked to another office''s court';
  exception when check_violation then
    raise notice 'ok - a case cannot use another office''s court (even bypassing RLS)';
  end;
  begin
    insert into public.cases (org_id, case_no_internal, assigned_drafter) values
      ('22222222-2222-2222-2222-222222222222', 'OTHER-2', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'FAIL: case assigned to another office''s drafter';
  exception when check_violation then
    raise notice 'ok - a case cannot be assigned to another office''s user';
  end;
  begin
    update public.cases set org_id = '22222222-2222-2222-2222-222222222222'
     where id = 'c0000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: a case moved to another office';
  exception when check_violation then
    raise notice 'ok - a case never moves to another office (even bypassing RLS)';
  end;
  begin
    update public.profiles set org_id = '22222222-2222-2222-2222-222222222222'
     where id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'FAIL: a user moved to another office';
  exception when check_violation then
    raise notice 'ok - a user never moves to another office (even bypassing RLS)';
  end;
  begin
    insert into public.parties (org_id, case_id, name, role, position) values
      ('22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-000000000001', 'X', 'borrower', 1);
    raise exception 'FAIL: party attached to another office''s case';
  exception when check_violation then
    raise notice 'ok - child rows cannot hang off another office''s case';
  end;
end $$;
rollback;

begin;
-- c2000000-…-0001 is the other office's own case (fixture above).
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
  set local role authenticated;
  begin
    insert into public.tasks (org_id, case_id, assignee_id, role, kind) values
      ('22222222-2222-2222-2222-222222222222', 'c2000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000f1', 'field', 'notary');
    raise exception 'FAIL: other office assigned a task to our field user';
  exception when check_violation then
    raise notice 'ok - an office cannot give tasks to another office''s users';
  end;
  begin
    insert into public.user_roles (user_id, org_id, role) values
      ('00000000-0000-0000-0000-0000000000d1', '22222222-2222-2222-2222-222222222222', 'admin');
    raise exception 'FAIL: other office granted a role to our user';
  exception when check_violation then
    raise notice 'ok - an office cannot grant roles to another office''s users';
  end;
  begin
    update public.profiles set org_id = '22222222-2222-2222-2222-222222222222'
     where id = '00000000-0000-0000-0000-0000000000d1';
    if found then raise exception 'FAIL: other office pulled our user across'; end if;
    raise notice 'ok - an office cannot pull another office''s user across';
  end;
  -- Sweep: nothing of the first office is visible in any org-scoped table.
  declare
    t text;
    n bigint;
  begin
    for t in select table_name from information_schema.columns
              where table_schema = 'public' and column_name = 'org_id' loop
      execute format('select count(*) from public.%I where org_id is distinct from %L', t, '22222222-2222-2222-2222-222222222222') into n;
      if n > 0 then raise exception 'FAIL: % rows of another office visible in %', n, t; end if;
    end loop;
    if exists (select 1 from public.organizations where id <> '22222222-2222-2222-2222-222222222222') then
      raise exception 'FAIL: another office is listed';
    end if;
    raise notice 'ok - no table shows another office''s rows';
  end;
  -- The same office keeps working normally.
  insert into public.tasks (org_id, case_id, assignee_id, role, kind) values
    ('22222222-2222-2222-2222-222222222222', 'c2000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-0000000000b9', 'admin', 'notary');
  raise notice 'ok - same-office links still work';
  reset role;
end $$;
rollback;

-- ---------------------------------------------------------------- office settings (20261026000000, 20261026010000)
update public.organizations set office_profile = '{"firmName": "Demo Legal Associates"}'
 where id = '11111111-1111-1111-1111-111111111111';

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((public.office_config() -> 'office_profile' ->> 'firmName') = 'Demo Legal Associates',
                      'a drafter reads the office profile through office_config()');
select pg_temp.expect((select name from public.organizations) = 'Demo Advocates', 'members still read the office name');
do $$ begin
  begin
    perform office_profile from public.organizations;
    raise exception 'FAIL: office_profile readable directly';
  exception when insufficient_privilege then raise notice 'ok - office_profile is not readable directly';
  end;
  begin
    perform public.update_office_settings('{"firmName": "Hijacked"}', '{}');
    raise exception 'FAIL: a drafter changed the office settings';
  exception when insufficient_privilege then raise notice 'ok - only an admin changes office settings';
  end;
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(public.office_config() is null, 'field staff do not see the office profile or settings');
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.update_office_settings('{"firmName": "Demo Legal Associates", "advocates": ["ADV. A. DEMO"]}', '{"forum": "summary_suit", "margins": "office"}');
select pg_temp.expect((public.office_config() -> 'settings' ->> 'margins') = 'office', 'an admin sets the office settings');
reset role;
select pg_temp.expect(exists (select 1 from public.audit_log where entity = 'organizations'
                              and org_id = '11111111-1111-1111-1111-111111111111' and actor_id = '00000000-0000-0000-0000-00000000000a'),
                      'office settings changes are in the audit chain');
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b9');
select pg_temp.expect(coalesce(public.office_config() -> 'office_profile' ->> 'firmName', '') <> 'Demo Legal Associates',
                      'another office cannot read the office profile');
select public.update_office_settings('{"firmName": "Other"}', '{}');
reset role;
select pg_temp.expect((select office_profile ->> 'firmName' from public.organizations where id = '11111111-1111-1111-1111-111111111111') = 'Demo Legal Associates',
                      'another office''s admin changes only its own office');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b9');
update public.cases set signatory_name = 'Outsider' where id = 'c0000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select signatory_name from public.cases where id = 'c0000000-0000-0000-0000-000000000001') is null,
                      'another office cannot set the signatory of a case');
rollback;

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect((public.office_config() -> 'office_profile' ->> 'firmName') = 'Demo Legal Associates',
                      'an approver reads the office profile through office_config()');
do $$ begin
  begin
    perform settings from public.organizations;
    raise exception 'FAIL: settings readable directly';
  exception when insufficient_privilege then raise notice 'ok - settings are not readable directly';
  end;
  begin
    perform public.update_office_settings('{"firmName": "X"}', '{}');
    raise exception 'FAIL: an approver changed the office settings';
  exception when insufficient_privilege then raise notice 'ok - an approver cannot change office settings';
  end;
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
do $$ begin
  begin
    perform public.update_office_settings('{"firmName": "X"}', '{}');
    raise exception 'FAIL: field staff changed the office settings';
  exception when insufficient_privilege then raise notice 'ok - field staff cannot change office settings';
  end;
end $$;
reset role;
select pg_temp.expect(not has_function_privilege('anon', 'public.office_config()', 'execute')
                      and not has_function_privilege('anon', 'public.update_office_settings(jsonb, jsonb)', 'execute'),
                      'anon cannot call the office settings functions');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    perform public.update_office_settings(null, '{}');
    raise exception 'FAIL: null profile accepted';
  exception when check_violation then raise notice 'ok - office settings must be JSON objects';
  end;
  begin
    perform public.update_office_settings('{}', '{"forum": "drt"}');
    raise exception 'FAIL: unknown forum accepted';
  exception when check_violation then raise notice 'ok - only known forum / margin values are stored';
  end;
  begin
    perform public.update_office_settings('{}', jsonb_build_object('x', repeat('a', 5000)));
    raise exception 'FAIL: oversized settings accepted';
  exception when check_violation then raise notice 'ok - oversized settings are refused';
  end;
end $$;
rollback;

-- Approver and field staff cannot change what the plaint prints.
insert into public.parties (id, org_id, case_id, role, name) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'borrower', 'M/s Demo Firm');
insert into public.loans (id, org_id, case_id) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001');
begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.parties set through_capacity = 'Proprietor', through_name = 'X' where id = 'e0000000-0000-0000-0000-000000000001';
update public.loans set executed_docs = '[{"title":"X","date":null}]' where id = 'e1000000-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
update public.parties set through_capacity = 'Proprietor', through_name = 'X' where id = 'e0000000-0000-0000-0000-000000000001';
update public.loans set executed_docs = '[{"title":"X","date":null}]' where id = 'e1000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select through_name from public.parties where id = 'e0000000-0000-0000-0000-000000000001') is null
                      and (select executed_docs from public.loans where id = 'e1000000-0000-0000-0000-000000000001') = '[]'::jsonb,
                      'approver and field staff cannot edit "through" or executed documents');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
update public.loans set executed_docs = '[{"title":"Demand Promissory Note","date":"2023-07-12"}]' where id = 'e1000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select jsonb_array_length(executed_docs) from public.loans where id = 'e1000000-0000-0000-0000-000000000001') = 1,
                      'the assigned drafter can record executed documents');
rollback;

begin;
do $$ begin
  begin
    update public.organizations set office_profile = '[]' where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: office_profile accepted a non-object';
  exception when check_violation then raise notice 'ok - office_profile must be a JSON object';
  end;
  begin
    insert into public.parties (org_id, case_id, role, name, through_capacity)
    values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'borrower', 'M/s Demo', 'Proprietor');
    raise exception 'FAIL: "through" capacity accepted without a name';
  exception when check_violation then raise notice 'ok - "through" needs both capacity and name';
  end;
  begin
    insert into public.loans (org_id, case_id, executed_docs)
    values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', '{}');
    raise exception 'FAIL: executed_docs accepted a non-array';
  exception when check_violation then raise notice 'ok - executed_docs must be a JSON array';
  end;
  begin
    update public.cases set expenses_paise = -1 where id = 'c0000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: negative expenses accepted';
  exception when check_violation then raise notice 'ok - claim heads cannot be negative';
  end;
end $$;
rollback;

-- admin may record approvals (20261029000000); maker-checker still binds the admin
begin;
insert into public.drafts (id, org_id, case_id, doc_kind, language, created_by, status) values
  ('d0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000002', 'vakalatnama', 'en', '00000000-0000-0000-0000-0000000000d2', 'in_approval'),
  ('d0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000002', 'address_memo', 'en', '00000000-0000-0000-0000-00000000000a', 'in_approval');
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  begin
    insert into public.approvals (org_id, draft_id, decision)
    values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-0000000000a2', 'approved');
    raise exception 'FAIL: admin approved own draft';
  exception when check_violation then
    raise notice 'ok - admin cannot approve own draft';
  end;
  reset role;
end $$;
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  set local role authenticated;
  begin
    insert into public.approvals (org_id, draft_id, decision)
    values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-0000000000a1', 'approved');
    raise exception 'FAIL: field staff approved';
  exception when insufficient_privilege then
    raise notice 'ok - field staff cannot approve';
  end;
  reset role;
end $$;
-- an admin who adds a version to someone else's draft becomes an editor and cannot approve it
savepoint before_edit;
insert into public.draft_versions (org_id, draft_id, version, docx_path, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-0000000000a1', 1,
   '11111111-1111-1111-1111-111111111111/c0000000-0000-0000-0000-000000000002/drafts/v.docx',
   '00000000-0000-0000-0000-00000000000a');
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  begin
    insert into public.approvals (org_id, draft_id, decision)
    values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-0000000000a1', 'approved');
    raise exception 'FAIL: admin approved a draft they edited';
  exception when check_violation then
    raise notice 'ok - admin cannot approve a draft they edited';
  end;
  reset role;
end $$;
rollback to savepoint before_edit;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.approvals (org_id, draft_id, decision)
values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-0000000000a1', 'approved');
select pg_temp.expect(
  (select status from public.drafts where id = 'd0000000-0000-0000-0000-0000000000a1') = 'approved',
  'admin can approve a draft written by someone else');
rollback;

select pg_temp.expect(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'RLS enabled on every public table');

\echo 'ALL RLS TESTS PASSED'

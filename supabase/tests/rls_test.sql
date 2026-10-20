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
  exception when insufficient_privilege then
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

select pg_temp.expect(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'RLS enabled on every public table');

\echo 'ALL RLS TESTS PASSED'

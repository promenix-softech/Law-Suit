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
   'c0000000-0000-0000-0000-000000000002', 'x/y/scans/b.pdf', repeat('0', 64), '00000000-0000-0000-0000-0000000000d2');

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

select pg_temp.expect(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'RLS enabled on every public table');

\echo 'ALL RLS TESTS PASSED'

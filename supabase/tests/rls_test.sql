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

insert into public.drafts (id, org_id, case_id, doc_kind, language, created_by) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'plaint', 'en', '00000000-0000-0000-0000-0000000000d1');

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

begin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.approvals (org_id, draft_id, decision)
values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'approved');
select pg_temp.expect(true, 'independent approver can approve');
commit;

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

-- audit log: populated, chained, append-only
select pg_temp.expect((select count(*) from public.audit_log where entity = 'cases') = 2, 'case inserts audited');
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

select pg_temp.expect(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'RLS enabled on every public table');

\echo 'ALL RLS TESTS PASSED'

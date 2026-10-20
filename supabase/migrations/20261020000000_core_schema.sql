-- Civil Suits — core schema (Phase 1).
-- Rules: every table has org_id + RLS; money in paise (bigint); timestamps UTC;
-- *_enc columns hold AES-256-GCM ciphertext produced server-side (never plaintext PII).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- enums
create type public.app_role as enum ('admin', 'field', 'drafter', 'approver');
create type public.case_status as enum (
  'bank_call', 'case_created', 'docs_uploaded', 'extraction_review', 'notice_generated',
  'notice_sent', 'mediation_12a', 'drafting', 'in_approval', 'approved', 'notary_stamp',
  'efiling_ready', 'filed', 'listed', 'disposed'
);
create type public.suit_type as enum ('ordinary', 'summary_o37', 'commercial');
create type public.court_type as enum ('civil', 'commercial', 'drt');
create type public.party_role as enum ('borrower', 'co_borrower', 'guarantor');
create type public.doc_kind as enum (
  'demand_notice', 'plaint', 'vakalatnama', 'affidavit', 'statement_of_truth',
  'bbe_certificate', 'mediation_12a', 'list_of_documents'
);
create type public.lang as enum ('en', 'mr', 'bi');
create type public.draft_status as enum ('draft', 'in_approval', 'returned', 'approved');
create type public.task_kind as enum ('collect_docs', 'notary', 'efile', 'draft', 'approve', 'dispatch_notice');
create type public.task_status as enum ('open', 'in_progress', 'done', 'cancelled');

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- tenancy & users
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gstin text,
  plan text not null default 'pilot',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  full_name text not null,
  phone_enc bytea,
  mfa_enrolled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id, role)
);

-- security definer so policies can consult roles without recursive RLS
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.org_id = ur.org_id
    where ur.user_id = auth.uid() and ur.role = r
  )
$$;

-- ---------------------------------------------------------------- masters
create table public.format_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  font text not null default 'Times New Roman',
  font_size_pt numeric(4,1) not null default 14,
  line_spacing numeric(3,2) not null default 1.5,
  margins_in jsonb not null default '{"top":1.5,"bottom":1.5,"left":1.75,"right":1.0}',
  header_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.banks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  short_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, short_code)
);

create table public.bank_branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  bank_id uuid not null references public.banks (id),
  branch_name text not null,
  address text,
  ifsc text check (ifsc is null or ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  district text not null,
  court_type public.court_type not null,
  efiling_code text,
  header_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  bank_id uuid references public.banks (id),
  court_type public.court_type,
  doc_kind public.doc_kind not null,
  language public.lang not null,
  version int not null,
  effective_from date not null,
  legal_basis text not null,
  docx_path text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- cases
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  bank_branch_id uuid references public.bank_branches (id),
  court_id uuid references public.courts (id),
  case_no_internal text not null,
  status public.case_status not null default 'case_created',
  suit_type public.suit_type,
  claim_amount_paise bigint check (claim_amount_paise >= 0),
  specified_value_paise bigint check (specified_value_paise >= 0),
  is_commercial boolean not null default false,
  needs_12a boolean not null default false,
  urgent_interim_relief boolean not null default false,
  assigned_drafter uuid references auth.users (id),
  assigned_approver uuid references auth.users (id),
  cnr_no text,
  filing_no text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, case_no_internal),
  check (assigned_approver is null or assigned_approver is distinct from assigned_drafter)
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  role public.party_role not null,
  position int not null default 1,
  name text not null,
  father_name text,
  address text,
  pan_enc bytea,
  aadhaar_last4 char(4) check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  dob_enc bytea,
  phone_enc bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  account_no_enc bytea,
  account_last4 text,
  facility_type text,
  sanction_date date,
  sanction_amount_paise bigint check (sanction_amount_paise >= 0),
  roi_bps int check (roi_bps >= 0),
  npa_date date,
  outstanding_paise bigint check (outstanding_paise >= 0),
  interest_upto_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid references public.cases (id) on delete set null,
  batch_id uuid,
  storage_path text not null,
  sha256 text not null,
  page_count int,
  doc_type text,
  uploaded_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  document_id uuid not null references public.documents (id) on delete cascade,
  page_no int not null,
  ocr_text_enc bytea,
  class text,
  class_confidence numeric(4,3),
  case_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, page_no)
);

create table public.extracted_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  field_key text not null,
  value_enc bytea,
  confidence numeric(4,3),
  source_page_id uuid references public.document_pages (id),
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, field_key)
);

-- ---------------------------------------------------------------- drafting & approval
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  doc_kind public.doc_kind not null,
  language public.lang not null,
  template_id uuid references public.templates (id),
  status public.draft_status not null default 'draft',
  current_version int not null default 0,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.draft_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  version int not null,
  docx_path text,
  pdf_path text,
  diff_summary text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (draft_id, version)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  approver_id uuid not null default auth.uid() references auth.users (id),
  decision text not null check (decision in ('approved', 'returned')),
  comments text,
  created_at timestamptz not null default now()
);

-- Maker-checker: the approver can never be the draft's author (enforced in DB, not UI).
create or replace function public.enforce_maker_checker() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
begin
  select created_by into author from public.drafts where id = new.draft_id;
  if author is null then
    raise exception 'draft % not found', new.draft_id;
  end if;
  if new.approver_id = author then
    raise exception 'maker-checker violation: approver cannot approve own draft'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.draft_versions
    where draft_id = new.draft_id and created_by = new.approver_id
  ) then
    raise exception 'maker-checker violation: approver edited this draft'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger approvals_maker_checker before insert or update on public.approvals
for each row execute function public.enforce_maker_checker();

-- ---------------------------------------------------------------- workflow
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  assignee_id uuid not null references auth.users (id),
  role public.app_role not null,
  kind public.task_kind not null,
  due_at timestamptz,
  status public.task_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  dispatch_mode text check (dispatch_mode in ('rpad', 'speed_post', 'email', 'hand')),
  tracking_no text,
  sent_at timestamptz,
  served_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mediations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  authority text not null,
  applied_at date,
  outcome text check (outcome in ('pending', 'settled', 'failed', 'non_starter')),
  report_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.filings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  efiling_no text,
  court_fee_paise bigint check (court_fee_paise >= 0),
  txn_id text,
  filed_at timestamptz,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id),
  case_id uuid references public.cases (id) on delete set null,
  kind text not null check (kind in ('ocr_page', 'llm_tokens', 'suit_pack', 'notice')),
  qty bigint not null,
  cost_paise bigint not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit log (append-only, hash chain)
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  before_hash text,
  after_hash text,
  ip inet,
  ua text,
  at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null
);

create or replace function public.audit_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('audit_log:' || new.org_id::text));
  select row_hash into last_hash from public.audit_log
    where org_id = new.org_id order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.at := now();
  new.row_hash := encode(extensions.digest(
    concat_ws('|', new.prev_hash, new.org_id, new.actor_id, new.action, new.entity,
              new.entity_id, new.before_hash, new.after_hash, new.at), 'sha256'), 'hex');
  return new;
end $$;

create trigger audit_log_chain before insert on public.audit_log
for each row execute function public.audit_chain();

create or replace function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_no_update before update or delete on public.audit_log
for each row execute function public.audit_log_immutable();

-- Generic row audit for state-bearing tables.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, before_hash, after_hash)
  values (
    (rec ->> 'org_id')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    (rec ->> 'id')::uuid,
    case when tg_op <> 'INSERT' then encode(extensions.digest(to_jsonb(old)::text, 'sha256'), 'hex') end,
    case when tg_op <> 'DELETE' then encode(extensions.digest(to_jsonb(new)::text, 'sha256'), 'hex') end
  );
  return null;
end $$;

-- ---------------------------------------------------------------- triggers on all org tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','profiles','format_profiles','banks','bank_branches','courts','templates',
    'cases','parties','loans','documents','document_pages','extracted_fields','drafts',
    'tasks','notices','mediations','filings'
  ] loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;

  foreach t in array array[
    'cases','parties','loans','documents','extracted_fields','drafts','draft_versions',
    'approvals','tasks','notices','mediations','filings','user_roles'
  ] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
-- Deny by default: enable RLS everywhere, then grant narrowly.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Case visibility: admin/approver see all org cases; drafter only assigned;
-- field only cases where they hold a task.
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
        or exists (select 1 from public.tasks t where t.case_id = c.id and t.assignee_id = auth.uid())
      )
  )
$$;

create policy org_read on public.organizations for select to authenticated
  using (id = public.current_org_id());

create policy profile_read on public.profiles for select to authenticated
  using (org_id = public.current_org_id());
create policy profile_admin on public.profiles for all to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'))
  with check (org_id = public.current_org_id() and public.has_role('admin'));

create policy roles_read on public.user_roles for select to authenticated
  using (org_id = public.current_org_id());
create policy roles_admin on public.user_roles for all to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'))
  with check (org_id = public.current_org_id() and public.has_role('admin'));

-- Masters: everyone in org reads; admin writes.
do $$
declare
  t text;
begin
  foreach t in array array['format_profiles','banks','bank_branches','courts','templates'] loop
    execute format('create policy %I_read on public.%I for select to authenticated
                    using (org_id = public.current_org_id())', t, t);
    execute format('create policy %I_admin on public.%I for all to authenticated
                    using (org_id = public.current_org_id() and public.has_role(''admin''))
                    with check (org_id = public.current_org_id() and public.has_role(''admin''))', t, t);
  end loop;
end $$;

create policy cases_read on public.cases for select to authenticated
  using (public.can_see_case(id));
create policy cases_admin on public.cases for all to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'))
  with check (org_id = public.current_org_id() and public.has_role('admin'));
create policy cases_drafter_update on public.cases for update to authenticated
  using (org_id = public.current_org_id() and assigned_drafter = auth.uid())
  with check (org_id = public.current_org_id() and assigned_drafter = auth.uid());

-- Case-scoped child tables: read if case visible; write by admin or the assigned drafter.
create or replace function public.can_edit_case(c_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cases c
    where c.id = c_id and c.org_id = public.current_org_id()
      and (public.has_role('admin') or c.assigned_drafter = auth.uid())
  )
$$;

do $$
declare
  t text;
begin
  foreach t in array array['parties','loans','extracted_fields','drafts','notices','mediations','filings'] loop
    execute format('create policy %I_read on public.%I for select to authenticated
                    using (public.can_see_case(case_id))', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated
                    using (public.can_edit_case(case_id))
                    with check (org_id = public.current_org_id() and public.can_edit_case(case_id))', t, t);
  end loop;
end $$;

create policy documents_read on public.documents for select to authenticated
  using (org_id = public.current_org_id()
         and (case_id is null and (public.has_role('admin') or public.has_role('drafter'))
              or case_id is not null and public.can_see_case(case_id)));
create policy documents_insert on public.documents for insert to authenticated
  with check (org_id = public.current_org_id() and uploaded_by = auth.uid()
              and (case_id is null or public.can_edit_case(case_id)));
create policy documents_admin on public.documents for all to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'))
  with check (org_id = public.current_org_id() and public.has_role('admin'));

create policy pages_read on public.document_pages for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));

create policy draft_versions_read on public.draft_versions for select to authenticated
  using (exists (select 1 from public.drafts d where d.id = draft_id));
create policy draft_versions_insert on public.draft_versions for insert to authenticated
  with check (org_id = public.current_org_id() and created_by = auth.uid()
              and exists (select 1 from public.drafts d where d.id = draft_id and public.can_edit_case(d.case_id)));

create policy approvals_read on public.approvals for select to authenticated
  using (org_id = public.current_org_id());
create policy approvals_insert on public.approvals for insert to authenticated
  with check (org_id = public.current_org_id() and approver_id = auth.uid() and public.has_role('approver'));

create policy tasks_read on public.tasks for select to authenticated
  using (org_id = public.current_org_id() and (assignee_id = auth.uid() or public.has_role('admin')));
create policy tasks_update_own on public.tasks for update to authenticated
  using (assignee_id = auth.uid()) with check (assignee_id = auth.uid());
create policy tasks_admin on public.tasks for all to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'))
  with check (org_id = public.current_org_id() and public.has_role('admin'));

create policy usage_read on public.usage_events for select to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'));

create policy audit_read on public.audit_log for select to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'));
-- No insert/update/delete policies on audit_log: only security-definer triggers write it.
revoke update, delete, truncate on public.audit_log from authenticated, anon;

create index on public.cases (org_id, status);
create index on public.cases (assigned_drafter);
create index on public.tasks (assignee_id, status);
create index on public.parties (case_id);
create index on public.documents (case_id);
create index on public.document_pages (document_id);
create index on public.audit_log (org_id, id);

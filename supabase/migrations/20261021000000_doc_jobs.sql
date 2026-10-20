-- Document jobs for the worker (VPS): DOCX → PDF/A conversion and the e-filing bundle.
-- Users enqueue; only the worker (service_role) claims, completes or fails jobs, through
-- the functions below. A plain table with SKIP LOCKED is the queue (see ADR 0002).

create table public.doc_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  kind text not null check (kind in ('draft_pdf', 'efiling_bundle')),
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  locked_at timestamptz,
  output_path text,
  output_meta jsonb not null default '{}',
  error text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.doc_jobs (status, created_at) where status in ('queued', 'running');
create index on public.doc_jobs (case_id, created_at desc);

alter table public.doc_jobs enable row level security;
alter table public.doc_jobs force row level security;

create trigger doc_jobs_updated_at before update on public.doc_jobs
for each row execute function public.set_updated_at();
create trigger doc_jobs_audit after insert or update or delete on public.doc_jobs
for each row execute function public.audit_row();

-- One active bundle per case and one active conversion per draft version.
create unique index doc_jobs_one_active_bundle on public.doc_jobs (case_id)
  where kind = 'efiling_bundle' and status in ('queued', 'running');
create unique index doc_jobs_one_active_pdf on public.doc_jobs ((payload ->> 'draft_version_id'))
  where kind = 'draft_pdf' and status in ('queued', 'running');

-- ---------------------------------------------------------------- storage paths
-- The worker reads files with the service role (no storage RLS), so every path it can be
-- pointed at must sit inside its own case folder: {org_id}/{case_id}/...
create or replace function public.path_in_case(p text, org uuid, c uuid) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null
     and split_part(p, '/', 1) = org::text
     and split_part(p, '/', 2) = c::text
     and p !~ '(^|/)\.\.?(/|$)' and position('//' in p) = 0 and p !~ '/$'
     and array_length(string_to_array(p, '/'), 1) >= 4
$$;
revoke execute on function public.path_in_case(text, uuid, uuid) from public, anon;
grant execute on function public.path_in_case(text, uuid, uuid) to authenticated, service_role;

create or replace function public.documents_path_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.case_id is null or not public.path_in_case(new.storage_path, new.org_id, new.case_id) then
    raise exception 'storage path must be inside the case folder';
  end if;
  return new;
end $$;
create trigger documents_path_check before insert or update of storage_path, case_id, org_id
on public.documents for each row execute function public.documents_path_check();

create or replace function public.draft_versions_path_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
begin
  select case_id into c from public.drafts where id = new.draft_id and org_id = new.org_id;
  if c is null then
    raise exception 'draft not in this org';
  end if;
  if (new.docx_path is not null and not public.path_in_case(new.docx_path, new.org_id, c))
     or (new.pdf_path is not null and not public.path_in_case(new.pdf_path, new.org_id, c)) then
    raise exception 'draft path must be inside the case folder';
  end if;
  return new;
end $$;
create trigger draft_versions_path_check before insert or update of docx_path, pdf_path, draft_id, org_id
on public.draft_versions for each row execute function public.draft_versions_path_check();
revoke execute on function public.draft_versions_path_check() from public, anon, authenticated;

-- Payload must point at this case's own records; state columns start clean.
create or replace function public.doc_jobs_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ann jsonb;
  st public.case_status;
begin
  new.error := null;
  new.output_meta := '{}';
  new.locked_at := null;
  if pg_column_size(new.payload) > 16384 then
    raise exception 'payload too large';
  end if;
  if new.kind = 'draft_pdf' then
    if not exists (
      select 1 from public.draft_versions v join public.drafts d on d.id = v.draft_id
      where v.id = (new.payload ->> 'draft_version_id')::uuid
        and d.case_id = new.case_id and v.org_id = new.org_id
        and public.path_in_case(v.docx_path, new.org_id, new.case_id)
    ) then
      raise exception 'draft version does not belong to this case';
    end if;
  else
    select status into st from public.cases where id = new.case_id and org_id = new.org_id;
    if st is null or st not in ('approved', 'notary_stamp', 'efiling_ready') then
      raise exception 'the e-filing bundle needs an approved plaint';
    end if;
    if jsonb_typeof(coalesce(new.payload -> 'annexures', '[]')) <> 'array' then
      raise exception 'annexures must be a list';
    end if;
    for ann in select * from jsonb_array_elements(coalesce(new.payload -> 'annexures', '[]')) loop
      if length(coalesce(ann ->> 'title', '')) not between 1 and 120 or not exists (
        select 1 from public.documents
        where id = (ann ->> 'document_id')::uuid and case_id = new.case_id and org_id = new.org_id
          and public.path_in_case(storage_path, new.org_id, new.case_id)
      ) then
        raise exception 'annexure does not belong to this case';
      end if;
    end loop;
  end if;
  return new;
end $$;

create trigger doc_jobs_validate before insert on public.doc_jobs
for each row execute function public.doc_jobs_validate();

create policy doc_jobs_read on public.doc_jobs for select to authenticated
  using (org_id = public.current_org_id() and public.can_see_case(case_id));
create policy doc_jobs_insert on public.doc_jobs for insert to authenticated
  with check (org_id = public.current_org_id() and created_by = auth.uid()
              and status = 'queued' and attempts = 0 and output_path is null
              and public.can_edit_case(case_id));
-- No update/delete policies: state changes only through the worker functions.

-- ---------------------------------------------------------------- worker functions
-- Takes the oldest queued job (or a stale running one, up to 3 attempts).
create or replace function public.claim_doc_job() returns setof public.doc_jobs
language sql security definer set search_path = '' as $$
  update public.doc_jobs j
     set status = 'running', attempts = j.attempts + 1, locked_at = now(), error = null
   where j.id = (
     select id from public.doc_jobs
      where status = 'queued'
         or (status = 'running' and locked_at < now() - interval '15 minutes' and attempts < 3)
      order by created_at
      for update skip locked
      limit 1)
  returning j.*
$$;

create or replace function public.complete_doc_job(job_id uuid, out_path text, meta jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.doc_jobs;
begin
  select * into j from public.doc_jobs where id = job_id and status = 'running' for update;
  if not found then raise exception 'job is not running'; end if;
  if not public.path_in_case(out_path, j.org_id, j.case_id) then
    raise exception 'output path outside the case folder';
  end if;
  update public.doc_jobs
     set status = 'done', output_path = out_path, output_meta = coalesce(meta, '{}'), locked_at = null
   where id = job_id;
  if j.kind = 'draft_pdf' then
    update public.draft_versions set pdf_path = out_path
     where id = (j.payload ->> 'draft_version_id')::uuid;
  end if;
end $$;

create or replace function public.fail_doc_job(job_id uuid, err text)
returns void language sql security definer set search_path = '' as $$
  update public.doc_jobs
     set status = case when attempts >= 3 then 'failed' else 'queued' end,
         error = left(err, 500), locked_at = null
   where id = job_id and status = 'running'
$$;

revoke execute on function public.claim_doc_job() from public, anon, authenticated;
revoke execute on function public.complete_doc_job(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_doc_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.doc_jobs_validate() from public, anon, authenticated;
grant execute on function public.claim_doc_job() to service_role;
grant execute on function public.complete_doc_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_doc_job(uuid, text) to service_role;

-- OCR jobs (Sarvam Document Intelligence) and write access to per-page OCR text.

create table public.ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  document_id uuid not null references public.documents (id) on delete cascade,
  provider text not null default 'sarvam',
  pipeline text not null default 'digitise' check (pipeline in ('digitise', 'extract')),
  provider_job_id text not null,
  language text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'partially_completed', 'failed', 'rejected')),
  pages_total int,
  pages_succeeded int,
  error text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_job_id)
);

create index on public.ocr_jobs (document_id, created_at desc);

alter table public.ocr_jobs enable row level security;
alter table public.ocr_jobs force row level security;

create trigger ocr_jobs_updated_at before update on public.ocr_jobs
for each row execute function public.set_updated_at();
create trigger ocr_jobs_audit after insert or update or delete on public.ocr_jobs
for each row execute function public.audit_row();

-- Visibility and edit rights follow the document's case.
create or replace function public.document_case_id(doc_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case_id from public.documents where id = doc_id and org_id = public.current_org_id()
$$;
revoke execute on function public.document_case_id(uuid) from public, anon;
grant execute on function public.document_case_id(uuid) to authenticated;

create policy ocr_jobs_read on public.ocr_jobs for select to authenticated
  using (org_id = public.current_org_id() and public.can_see_case(public.document_case_id(document_id)));
create policy ocr_jobs_insert on public.ocr_jobs for insert to authenticated
  with check (org_id = public.current_org_id() and created_by = auth.uid()
              and public.can_edit_case(public.document_case_id(document_id)));
create policy ocr_jobs_update on public.ocr_jobs for update to authenticated
  using (org_id = public.current_org_id() and public.can_edit_case(public.document_case_id(document_id)))
  with check (org_id = public.current_org_id() and public.can_edit_case(public.document_case_id(document_id)));

-- document_pages had read-only access; OCR results are written by the case's editors.
create policy pages_insert on public.document_pages for insert to authenticated
  with check (org_id = public.current_org_id() and public.can_edit_case(public.document_case_id(document_id)));
create policy pages_update on public.document_pages for update to authenticated
  using (org_id = public.current_org_id() and public.can_edit_case(public.document_case_id(document_id)))
  with check (org_id = public.current_org_id() and public.can_edit_case(public.document_case_id(document_id)));

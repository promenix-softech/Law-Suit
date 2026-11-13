-- Opening a case from the bank's file: the admin uploads the file BEFORE the case exists, the AI
-- reads it, the admin reviews every value and only then opens the case. Until then the file sits
-- in a private intake area of the admin's own, and nothing is written to the case tables.

-- 1. Storage: {org_id}/{user_id}/{generated name}; only the admin who uploaded it, in their office.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-intake', 'case-intake', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy case_intake_read on storage.objects for select to authenticated
  using (
    bucket_id = 'case-intake'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.has_role('admin')
  );
create policy case_intake_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'case-intake'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.has_role('admin')
  );
-- Deleted once the case is opened (the file moves into the case) or the intake is discarded.
create policy case_intake_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'case-intake'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.has_role('admin')
  );

-- 2. One row per file read by the AI: holds the provider's job, feeds the AI quota, and links
--    the case once it is opened. Rows are never deleted (the quota counts them).
create table public.case_intakes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  storage_path text not null
    check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'),
  provider_job_id text not null check (char_length(provider_job_id) between 1 and 200),
  status text not null default 'reading' check (status in ('reading', 'read', 'failed', 'used', 'discarded')),
  pages int check (pages is null or pages between 0 and 1000),
  case_id uuid references public.cases (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the file is in the uploader's own folder of their own office
  check (split_part(storage_path, '/', 1) = org_id::text and split_part(storage_path, '/', 2) = created_by::text),
  check (status <> 'used' or case_id is not null)
);
create index case_intakes_org_created_idx on public.case_intakes (org_id, created_at);
create index case_intakes_created_by_idx on public.case_intakes (created_by, created_at);
create index case_intakes_case_id_idx on public.case_intakes (case_id);

alter table public.case_intakes enable row level security;
alter table public.case_intakes force row level security;

create policy case_intakes_read on public.case_intakes for select to authenticated
  using (created_by = (select auth.uid()) and org_id = public.current_org_id() and public.has_role('admin'));
create policy case_intakes_insert on public.case_intakes for insert to authenticated
  with check (created_by = (select auth.uid()) and org_id = public.current_org_id() and public.has_role('admin'));
create policy case_intakes_update on public.case_intakes for update to authenticated
  using (created_by = (select auth.uid()) and org_id = public.current_org_id() and public.has_role('admin'))
  with check (
    created_by = (select auth.uid()) and org_id = public.current_org_id() and public.has_role('admin')
    and (case_id is null or public.can_edit_case(case_id))
  );

-- Fixed facts stay fixed; the status only moves forward; the case is linked once, on opening.
create or replace function public.guard_case_intake() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('role', true) <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'reading' or new.case_id is not null or new.pages is not null then
      raise exception 'a new intake starts reading, with no case yet' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.org_id <> old.org_id or new.created_by <> old.created_by
     or new.storage_path <> old.storage_path or new.provider_job_id <> old.provider_job_id then
    raise exception 'an intake keeps its office, owner, file and job' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'reading' and new.status in ('read', 'failed'))
    or (old.status in ('read', 'failed') and new.status in ('used', 'discarded'))
  ) then
    raise exception 'an intake cannot go from % to %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.case_id is distinct from old.case_id and not (old.case_id is null and new.status = 'used' and old.status <> 'used') then
    raise exception 'an intake is linked to its case once, when the case is opened' using errcode = 'check_violation';
  end if;
  if old.pages is not null and new.pages is distinct from old.pages then
    raise exception 'the page count of a read file does not change' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.guard_case_intake() from public, anon, authenticated;

create trigger case_intakes_guard before insert or update on public.case_intakes
for each row execute function public.guard_case_intake();
create trigger case_intakes_updated_at before update on public.case_intakes
for each row execute function public.set_updated_at();
create trigger case_intakes_audit after insert or update or delete on public.case_intakes
for each row execute function public.audit_row();
create trigger same_org before insert or update on public.case_intakes
for each row execute function public.enforce_same_org('case_id', 'cases', 'created_by', 'user');
create trigger case_intakes_created_now before insert or update on public.case_intakes
for each row execute function public.force_created_now();

-- 3. The AI quota counts files read for new cases as well as scans read inside cases.
create or replace function public.ai_quota_ok(per_user_hour int default 60, per_org_day int default 1000)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.ocr_jobs
      where created_by = auth.uid() and created_at > now() - interval '1 hour')
    + (select count(*) from public.case_intakes
      where created_by = auth.uid() and created_at > now() - interval '1 hour') < per_user_hour
    and
    (select count(*) from public.ocr_jobs
      where org_id = public.current_org_id() and created_at > now() - interval '1 day')
    + (select count(*) from public.case_intakes
      where org_id = public.current_org_id() and created_at > now() - interval '1 day') < per_org_day
$$;

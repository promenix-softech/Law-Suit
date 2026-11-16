-- Atomic OCR start.
-- Until now the app looked for a running job, called the paid API and only then recorded the job,
-- so two requests at the same moment (a double click, two tabs, two people) could both pay for the
-- same scan. The job row is now written first, as a claim ('starting'), and a scan can have at most
-- one job that is starting or running in each pipeline.

alter table public.ocr_jobs alter column provider_job_id drop not null;

alter table public.ocr_jobs drop constraint ocr_jobs_status_check;
alter table public.ocr_jobs add constraint ocr_jobs_status_check
  check (status in ('starting', 'running', 'completed', 'partially_completed', 'failed', 'rejected'));

-- Only a claim, or a claim whose start failed, is without the provider's job id.
alter table public.ocr_jobs add constraint ocr_jobs_provider_job_check
  check (provider_job_id is not null or status in ('starting', 'failed'));

-- Older rows: where a scan already has two jobs running in one pipeline, the newest stays.
update public.ocr_jobs j
set status = 'failed', error = 'Superseded by a later job.'
where j.status = 'running'
  and exists (
    select 1 from public.ocr_jobs n
    where n.document_id = j.document_id and n.pipeline = j.pipeline and n.status = 'running'
      and (n.created_at, n.id) > (j.created_at, j.id)
  );

create unique index ocr_jobs_one_active on public.ocr_jobs (document_id, pipeline)
  where status in ('starting', 'running');

-- When a job was created is the database's word: the app frees a claim whose start never finished
-- by its age and the AI quota counts jobs by their age, so a signed-in user must not be able to
-- back- or forward-date one, on insert or later.
create trigger ocr_jobs_created_now before insert or update on public.ocr_jobs
for each row execute function public.force_created_now();

-- A job stays with its scan, its pipeline and the person who started it (the quota counts per
-- person); the provider's job id is written once; a finished job is not started again.
create or replace function public.guard_ocr_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return new;
  end if;
  if new.org_id is distinct from old.org_id or new.document_id is distinct from old.document_id
     or new.pipeline is distinct from old.pipeline or new.provider is distinct from old.provider
     or new.created_by is distinct from old.created_by then
    raise exception 'a job stays with its scan and its starter' using errcode = 'insufficient_privilege';
  end if;
  if old.provider_job_id is not null and new.provider_job_id is distinct from old.provider_job_id then
    raise exception 'the provider''s job id is written once' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status
     and (old.status not in ('starting', 'running') or new.status = 'starting') then
    raise exception 'a job cannot go from % to %', old.status, new.status using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.guard_ocr_job() from public, anon, authenticated;
create trigger ocr_jobs_guard before update on public.ocr_jobs
for each row execute function public.guard_ocr_job();

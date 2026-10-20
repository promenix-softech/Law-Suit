-- Bulk intake: an admin uploads one scan holding many loan files; the worker splits it into
-- pages, OCRs and classifies them in code, and proposes groups (one per loan account). The
-- admin confirms the split; the worker then creates the cases and their scans.
-- Files: private bucket case-batches, path {org_id}/{batch_id}/{file}.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-batches', 'case-batches', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'splitting', 'review', 'applying', 'applied', 'failed')),
  page_count int,
  -- Set by confirm_batch(): [{"pages":[1,2,3], "case_id": uuid|null, "case_no": text|null}]
  plan jsonb,
  -- Worker bookkeeping: {"<group index>": "<case id>"} for cases this batch created, so a
  -- retried apply reuses its own cases and never attaches to someone else's same-numbered case.
  created_cases jsonb not null default '{}',
  -- The uploaded original (many borrowers' files) is deleted 7 days after the batch closes.
  purged_at timestamptz,
  attempts int not null default 0,
  locked_at timestamptz,
  error text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = org_id::text and split_part(storage_path, '/', 2) = id::text
         and storage_path !~ '(^|/)\.\.?(/|$)' and array_length(string_to_array(storage_path, '/'), 1) = 3
         -- fixed name: bank scans are often named after the borrower or account
         and split_part(storage_path, '/', 3) = 'scan.pdf')
);

create table public.batch_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  batch_id uuid not null references public.batches (id) on delete cascade,
  page_no int not null check (page_no > 0),
  class text not null,
  class_confidence numeric(4,3),
  -- Only the last 4 digits for the reviewer; the worker groups by the full number in memory
  -- and never stores it (not even hashed: a short number with known digits is reversible).
  account_last4 text check (account_last4 ~ '^[0-9A-Z]{4}$'),
  borrower_hint text,
  group_no int not null,
  created_at timestamptz not null default now(),
  unique (batch_id, page_no)
);

create index on public.batches (status, created_at) where status in ('uploaded', 'applying');

alter table public.batches enable row level security;
alter table public.batches force row level security;
alter table public.batch_pages enable row level security;
alter table public.batch_pages force row level security;

create trigger batches_updated_at before update on public.batches
for each row execute function public.set_updated_at();
create trigger batches_audit after insert or update or delete on public.batches
for each row execute function public.audit_row();

-- Bulk intake is an admin task (it creates cases).
create policy batches_read on public.batches for select to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'));
create policy batches_insert on public.batches for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_role('admin') and created_by = auth.uid()
              and status = 'uploaded' and plan is null and attempts = 0 and page_count is null
              and created_cases = '{}'::jsonb and purged_at is null and locked_at is null);
create policy batch_pages_read on public.batch_pages for select to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'));

create policy case_batches_read on storage.objects for select to authenticated
  using (bucket_id = 'case-batches' and (storage.foldername(name))[1] = public.current_org_id()::text
         and public.has_role('admin'));
create policy case_batches_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'case-batches' and (storage.foldername(name))[1] = public.current_org_id()::text
              and public.has_role('admin') and array_length(storage.foldername(name), 1) = 2
              and split_part(name, '/', 3) = 'scan.pdf');

-- Admin confirms the split. Each group becomes a new case (case_no) or joins an existing
-- case of this org (case_id). Every page of the batch must be used exactly once.
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
      if not exists (select 1 from public.cases where id = (g ->> 'case_id')::uuid and org_id = b.org_id) then
        raise exception 'case not in this office';
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
revoke execute on function public.confirm_batch(uuid, jsonb) from public, anon;
grant execute on function public.confirm_batch(uuid, jsonb) to authenticated;

-- Worker side (service role only): claim uploaded/applying batches, write results.
create or replace function public.claim_batch() returns setof public.batches
language sql security definer set search_path = '' as $$
  update public.batches b
     set status = case when b.status = 'uploaded' then 'splitting' else b.status end,
         attempts = b.attempts + 1, locked_at = now()
   where b.id = (
     select id from public.batches
      where attempts < 3
        and ((status in ('uploaded', 'applying') and (locked_at is null or locked_at < now() - interval '30 minutes'))
             or (status = 'splitting' and locked_at < now() - interval '30 minutes'))
      order by created_at
      for update skip locked
      limit 1)
  returning b.*
$$;
revoke execute on function public.claim_batch() from public, anon, authenticated;
grant execute on function public.claim_batch() to service_role;

-- Case export (ZIP of case data and files) as a worker job. Admins only: an export holds
-- every file of the case. The ZIP is written to {org_id}/{case_id}/exports/.

alter table public.doc_jobs drop constraint doc_jobs_kind_check;
alter table public.doc_jobs add constraint doc_jobs_kind_check
  check (kind in ('draft_pdf', 'efiling_bundle', 'case_export'));

-- Exports live in their own private bucket: ZIPs larger than the 25 MB e-filing limit of
-- case-files. Only the worker writes (service role); only the office's admins can read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-exports', 'case-exports', false, 314572800, array['application/zip'])
on conflict (id) do nothing;

create policy case_exports_read on storage.objects for select to authenticated
  using (
    bucket_id = 'case-exports'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_role('admin')
    and public.can_see_case(public.storage_case_id(name))
  );

create unique index doc_jobs_one_active_export on public.doc_jobs (case_id)
  where kind = 'case_export' and status in ('queued', 'running');

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
  elsif new.kind = 'case_export' then
    if not public.has_role('admin') or new.payload <> '{}'::jsonb then
      raise exception 'only admins can export a case';
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
revoke execute on function public.doc_jobs_validate() from public, anon, authenticated;

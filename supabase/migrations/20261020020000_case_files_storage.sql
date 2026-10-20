-- Private storage for case files (scans, generated drafts).
-- Object path convention: {org_id}/{case_id}/{scans|drafts}/{file}
-- Objects are immutable: no update/delete policies; new versions get new paths.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-files', 'case-files', false, 26214400,  -- 25 MB, the eCourts per-document limit
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Second path segment as a case id; null when the path does not follow the convention.
create or replace function public.storage_case_id(object_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when (storage.foldername(object_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[2])::uuid
  end
$$;

revoke execute on function public.storage_case_id(text) from public, anon;
grant execute on function public.storage_case_id(text) to authenticated;

create policy case_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'case-files'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.can_see_case(public.storage_case_id(name))
  );

create policy case_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'case-files'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.can_edit_case(public.storage_case_id(name))
  );

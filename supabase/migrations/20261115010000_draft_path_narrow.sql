-- A draft's files live in the case's drafts folder and nowhere else.
-- Until now a draft version could point at any file of its case (a scan, the mediator's report):
-- `{org}/{case}/…`. The Word file must now be `{org}/{case}/drafts/<name>.docx` and its PDF
-- `{org}/{case}/drafts/<name>.pdf` — what the app and the worker have always written.

create or replace function public.draft_versions_path_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
  folder text;
begin
  select case_id into c from public.drafts where id = new.draft_id and org_id = new.org_id;
  if c is null then
    raise exception 'draft not in this org';
  end if;
  -- Both ids are uuids (hex digits and hyphens), so they are safe inside the pattern.
  folder := '^' || new.org_id::text || '/' || c::text || '/drafts/[^/]+\.';
  if (new.docx_path is not null
      and not (public.path_in_case(new.docx_path, new.org_id, c) and new.docx_path ~ (folder || 'docx$')))
     or (new.pdf_path is not null
      and not (public.path_in_case(new.pdf_path, new.org_id, c) and new.pdf_path ~ (folder || 'pdf$'))) then
    raise exception 'a draft''s files must be in the case''s drafts folder';
  end if;
  return new;
end $$;
revoke execute on function public.draft_versions_path_check() from public, anon, authenticated;

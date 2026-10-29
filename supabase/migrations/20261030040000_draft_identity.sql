-- A draft's identity (its case, kind of paper and language) never changes once created; otherwise
-- relabelling a paper could slip past the plaint lock or turn an approved affidavit into a
-- "plaint". The service role (migrations, repairs) may still change it.
create or replace function public.guard_draft_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) = 'authenticated'
     and (new.case_id, new.doc_kind, new.language, new.org_id) is distinct from (old.case_id, old.doc_kind, old.language, old.org_id) then
    raise exception 'a draft''s case, kind and language cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger drafts_guard_identity before update on public.drafts
for each row execute function public.guard_draft_identity();
revoke execute on function public.guard_draft_identity() from public, anon, authenticated;

-- The plaint lock looks at the paper before and after the update.
create or replace function public.guard_suit_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st public.case_status;
begin
  if (new.doc_kind::text not in ('plaint', 'original_application') and old.doc_kind::text not in ('plaint', 'original_application'))
     or new.current_version is not distinct from old.current_version then
    return new;
  end if;
  select status into st from public.cases where id = new.case_id;
  if current_setting('role', true) = 'authenticated'
     and st in ('notary_stamp', 'efiling_ready', 'filed', 'listed', 'disposed') then
    raise exception 'the plaint has gone to the notary or the court' using errcode = 'insufficient_privilege';
  end if;
  if st = 'approved' then
    update public.cases set status = 'drafting' where id = new.case_id;
  end if;
  return new;
end $$;

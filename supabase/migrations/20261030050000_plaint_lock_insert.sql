-- The plaint lock also covers a brand-new plaint (or OA) draft once the case has gone to the notary
-- or the court, so a case never ends up with a second plaint after that point.
create or replace function public.guard_suit_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) = 'authenticated'
     and new.doc_kind::text in ('plaint', 'original_application')
     and exists (select 1 from public.cases c where c.id = new.case_id
                  and c.status in ('notary_stamp', 'efiling_ready', 'filed', 'listed', 'disposed')) then
    raise exception 'the plaint has gone to the notary or the court' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger drafts_guard_suit_insert before insert on public.drafts
for each row execute function public.guard_suit_insert();
revoke execute on function public.guard_suit_insert() from public, anon, authenticated;

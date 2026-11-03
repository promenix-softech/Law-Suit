-- Filing record: after approval the case moves notary_stamp → efiling_ready → filed in the app; the
-- e-filing acknowledgement goes to `filings`, the court's CNR and filing number to `cases`.
-- CNR (eCourts Case Number Record): 16 characters, state + district letters, establishment digits,
-- 6-digit serial, 4-digit year (packages/domain/src/cnr.ts). One CNR belongs to one case per office.

alter table public.cases
  add constraint cases_cnr_format check (cnr_no is null or cnr_no ~ '^[A-Z]{4}[0-9]{12}$'),
  add constraint cases_filing_no_len check (filing_no is null or char_length(filing_no) between 1 and 60);

create unique index cases_cnr_unique on public.cases (org_id, cnr_no) where cnr_no is not null;

alter table public.filings
  add constraint filings_efiling_no_len check (efiling_no is null or char_length(efiling_no) between 1 and 60),
  add constraint filings_txn_len check (txn_id is null or char_length(txn_id) between 1 and 80),
  add constraint filings_status_known check (status is null or status in ('filed', 'objection', 'registered'));

-- CNR and filing number exist only once the suit is filed.
create or replace function public.guard_case_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.cnr_no is distinct from old.cnr_no or new.filing_no is distinct from old.filing_no)
     and (new.cnr_no is not null or new.filing_no is not null)
     and new.status not in ('filed', 'listed', 'disposed') then
    raise exception 'record the CNR and filing number after the suit is filed' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger cases_guard_registration before update of cnr_no, filing_no on public.cases
for each row execute function public.guard_case_registration();
revoke execute on function public.guard_case_registration() from public, anon, authenticated;

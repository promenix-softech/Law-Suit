-- Filing integrity (security review of 20261103000000):
--  1. "Filed" is tied to exactly one filing record, written in one transaction by record_filing();
--     users cannot add filing rows outside the e-filing step, nor change or delete them afterwards
--     (admins may correct them).
--  2. A CNR / filing number exists only on a filed case, on insert too; moving a case back below
--     "filed" requires clearing them.
--  3. "Ready for e-filing" needs an e-filing bundle built after the latest approval.
--  4. The notary lock covers the papers that are sworn or stamped: plaint / OA, affidavit /
--     statement of truth and vakalatnama.

-- 1a. One filing record per filed case.
create unique index filings_one_per_case on public.filings (case_id) where status = 'filed';

-- 1b. Users write filing rows only through the e-filing step; afterwards only admins may correct them.
create or replace function public.guard_filing_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st public.case_status;
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    select status into st from public.cases where id = new.case_id;
    if st is distinct from 'efiling_ready' then
      raise exception 'a filing is recorded only when the case is ready for e-filing' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if not public.has_role('admin') then
    raise exception 'only an admin can change or remove a filing record' using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end $$;
create trigger filings_guard_row before insert or update or delete on public.filings
for each row execute function public.guard_filing_row();
revoke execute on function public.guard_filing_row() from public, anon, authenticated;

-- 1c. Records the e-filing and marks the case filed, atomically, as the caller (RLS applies).
create or replace function public.record_filing(
  p_case_id uuid, p_efiling_no text, p_filed_on date, p_fee_paise bigint, p_txn_id text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  c record;
begin
  select id, org_id, status, created_at into c from public.cases where id = p_case_id for update;
  if c.id is null then
    raise exception 'case not found' using errcode = 'insufficient_privilege';
  end if;
  if c.status is distinct from 'efiling_ready' then
    raise exception 'mark the case ready for e-filing first' using errcode = 'check_violation';
  end if;
  if p_filed_on > (now() at time zone 'Asia/Kolkata')::date or p_filed_on < (c.created_at at time zone 'Asia/Kolkata')::date then
    raise exception 'filing date must be between the case''s opening and today' using errcode = 'check_violation';
  end if;
  insert into public.filings (org_id, case_id, efiling_no, court_fee_paise, txn_id, filed_at, status)
  values (c.org_id, c.id, p_efiling_no, p_fee_paise, nullif(p_txn_id, ''), (p_filed_on::text || ' 12:00:00+05:30')::timestamptz, 'filed');
  update public.cases set status = 'filed' where id = c.id;
end $$;
revoke execute on function public.record_filing(uuid, text, date, bigint, text) from public, anon;
grant execute on function public.record_filing(uuid, text, date, bigint, text) to authenticated;

-- 1d + 3. Status moves that need evidence: "filed" needs its filing record, "ready for e-filing"
-- needs a bundle built after the latest approval.
create or replace function public.guard_filing_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'filed' and not exists (
    select 1 from public.filings f where f.case_id = new.id and f.status = 'filed'
  ) then
    raise exception 'record the e-filing first' using errcode = 'check_violation';
  end if;
  if new.status = 'efiling_ready' and not exists (
    select 1 from public.doc_jobs j
     where j.case_id = new.id and j.kind = 'efiling_bundle' and j.status = 'done'
       and j.created_at >= coalesce((
         select max(a.created_at) from public.approvals a join public.drafts d on d.id = a.draft_id
          where d.case_id = new.id and a.decision = 'approved'
       ), '-infinity'::timestamptz)
  ) then
    raise exception 'build the e-filing bundle after the latest approval first' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger cases_guard_filing_status before update of status on public.cases
for each row execute function public.guard_filing_status();
revoke execute on function public.guard_filing_status() from public, anon, authenticated;

-- 2. CNR / filing number only on a filed case — on insert, on update, and when the status moves back.
drop trigger cases_guard_registration on public.cases;
create or replace function public.guard_case_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.cnr_no is not null or new.filing_no is not null)
     and new.status not in ('filed', 'listed', 'disposed') then
    raise exception 'a CNR and filing number belong to a filed suit' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger cases_guard_registration before insert or update on public.cases
for each row execute function public.guard_case_registration();

-- 4. The notary lock covers every paper that is sworn or stamped. A new version of an approved
--    plaint / OA still sends the case back to drafting.
create or replace function public.guard_suit_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st public.case_status;
  locked constant text[] := array['plaint', 'original_application', 'affidavit', 'statement_of_truth', 'vakalatnama'];
begin
  if (new.doc_kind::text <> all (locked) and old.doc_kind::text <> all (locked))
     or new.current_version is not distinct from old.current_version then
    return new;
  end if;
  select status into st from public.cases where id = new.case_id;
  if current_setting('role', true) = 'authenticated'
     and st in ('notary_stamp', 'efiling_ready', 'filed', 'listed', 'disposed') then
    raise exception 'this paper has gone to the notary or the court' using errcode = 'insufficient_privilege';
  end if;
  if st = 'approved' and new.doc_kind::text in ('plaint', 'original_application') then
    update public.cases set status = 'drafting' where id = new.case_id;
  end if;
  return new;
end $$;

create or replace function public.guard_suit_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) = 'authenticated'
     and new.doc_kind::text in ('plaint', 'original_application', 'affidavit', 'statement_of_truth', 'vakalatnama')
     and exists (select 1 from public.cases c where c.id = new.case_id
                  and c.status in ('notary_stamp', 'efiling_ready', 'filed', 'listed', 'disposed')) then
    raise exception 'this paper has gone to the notary or the court' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

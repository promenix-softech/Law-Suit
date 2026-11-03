-- Filing integrity, second round (security re-review of 20261103010000):
--  A. Every path that records a filing is checked in the database, not only record_filing():
--     the row must be a "filed" row with an e-filing number and a date between the case's opening
--     and today, and inserting it moves the case to "filed" in the same statement.
--  B. Timestamps the freshness rules rely on (bundle jobs, approvals, filings, cases) are set by
--     the database for signed-in users, never by the client.
--  C. Moving a case back below "filed" withdraws its filing record, so it no longer counts; a case
--     reaches filed / listed / disposed only with a filing recorded after the latest approval.
--  D. Sworn or stamped papers cannot be deleted once the case has gone to the notary, and no paper
--     that carries an approval decision can be deleted.

-- B. Server-side creation times for signed-in users.
create or replace function public.force_created_now() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) = 'authenticated' then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.force_created_now() from public, anon, authenticated;
create trigger doc_jobs_created_now before insert on public.doc_jobs
for each row execute function public.force_created_now();
create trigger approvals_created_now before insert on public.approvals
for each row execute function public.force_created_now();
create trigger filings_created_now before insert or update on public.filings
for each row execute function public.force_created_now();
create trigger cases_created_now before insert or update on public.cases
for each row execute function public.force_created_now();

-- C. A withdrawn filing record stays for the history but no longer counts.
alter table public.filings drop constraint filings_status_known;
alter table public.filings
  add constraint filings_status_known check (status is null or status in ('filed', 'objection', 'registered', 'withdrawn'));

-- A. Filing rows written by users: only the e-filing record itself, only at the e-filing step, with a
--    plausible date; later changes and removals by an admin only, and never while the case is filed.
create or replace function public.guard_filing_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    select status, created_at into c from public.cases where id = new.case_id;
    if c.status is distinct from 'efiling_ready' then
      raise exception 'a filing is recorded only when the case is ready for e-filing' using errcode = 'insufficient_privilege';
    end if;
    if new.status is distinct from 'filed' or coalesce(btrim(new.efiling_no), '') = '' or new.filed_at is null then
      raise exception 'a filing needs its e-filing number and date' using errcode = 'check_violation';
    end if;
    if (new.filed_at at time zone 'Asia/Kolkata')::date > today
       or (new.filed_at at time zone 'Asia/Kolkata')::date < (c.created_at at time zone 'Asia/Kolkata')::date then
      raise exception 'filing date must be between the case''s opening and today' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if not public.has_role('admin') then
    raise exception 'only an admin can change or remove a filing record' using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'filed' and (tg_op = 'DELETE' or new.status is distinct from 'filed')
     and exists (select 1 from public.cases where id = old.case_id and status in ('filed', 'listed', 'disposed')) then
    raise exception 'move the case back below filed before withdrawing its filing' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

-- A. Recording the filing moves the case to "filed" in the same statement, whichever path wrote it.
create or replace function public.filing_marks_case_filed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'filed' then
    update public.cases set status = 'filed' where id = new.case_id and status = 'efiling_ready';
  end if;
  return null;
end $$;
revoke execute on function public.filing_marks_case_filed() from public, anon, authenticated;
create trigger filings_mark_case_filed after insert on public.filings
for each row execute function public.filing_marks_case_filed();

-- C. Leaving "filed" (an admin correction) withdraws the filing record.
create or replace function public.withdraw_filing_on_rewind() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('filed', 'listed', 'disposed') and new.status not in ('filed', 'listed', 'disposed') then
    update public.filings set status = 'withdrawn' where case_id = new.id and status = 'filed';
  end if;
  return null;
end $$;
revoke execute on function public.withdraw_filing_on_rewind() from public, anon, authenticated;
create trigger cases_withdraw_filing after update of status on public.cases
for each row execute function public.withdraw_filing_on_rewind();

-- C. Status moves that need evidence, on insert too.
create or replace function public.guard_filing_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  last_approval timestamptz;
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status in ('notary_stamp', 'efiling_ready', 'filed', 'listed', 'disposed') then
      raise exception 'a new case starts at the beginning' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  select max(a.created_at) into last_approval
    from public.approvals a join public.drafts d on d.id = a.draft_id
   where d.case_id = new.id and a.decision = 'approved';
  if new.status in ('filed', 'listed', 'disposed') and old.status not in ('filed', 'listed', 'disposed')
     and not exists (
       select 1 from public.filings f
        where f.case_id = new.id and f.status = 'filed'
          and f.created_at >= coalesce(last_approval, '-infinity'::timestamptz)
     ) then
    raise exception 'record the e-filing first' using errcode = 'check_violation';
  end if;
  if new.status = 'efiling_ready' and not exists (
    select 1 from public.doc_jobs j
     where j.case_id = new.id and j.kind = 'efiling_bundle' and j.status = 'done'
       and j.created_at >= coalesce(last_approval, '-infinity'::timestamptz)
  ) then
    raise exception 'build the e-filing bundle after the latest approval first' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger cases_guard_filing_status on public.cases;
create trigger cases_guard_filing_status before insert or update of status on public.cases
for each row execute function public.guard_filing_status();

-- A. record_filing() keeps its friendly checks; the filing insert itself moves the case to filed.
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
end $$;

-- D. No deleting sworn papers after the notary, nor any paper that carries an approval decision.
create or replace function public.guard_draft_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return old;
  end if;
  if old.doc_kind::text in ('plaint', 'original_application', 'affidavit', 'statement_of_truth', 'vakalatnama')
     and exists (select 1 from public.cases c where c.id = old.case_id
                  and c.status in ('notary_stamp', 'efiling_ready', 'filed', 'listed', 'disposed')) then
    raise exception 'this paper has gone to the notary or the court' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.approvals a where a.draft_id = old.id) then
    raise exception 'a paper with an approval decision cannot be deleted' using errcode = 'insufficient_privilege';
  end if;
  return old;
end $$;
revoke execute on function public.guard_draft_delete() from public, anon, authenticated;
create trigger drafts_guard_delete before delete on public.drafts
for each row execute function public.guard_draft_delete();

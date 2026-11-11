-- Hearing diary integrity (security review of 20261109000000):
--  1. A written-up hearing keeps its date and its outcome: the outcome cannot be cleared (which
--     reopened the row to deletion and re-dating), and only an admin may correct its text.
--  2. Removing the last date of a listed case takes the case back to "filed".
--  3. Dates are bounded by the filing, not by the day the case was opened: a hearing or a disposal
--     cannot be dated before the suit was filed.
--  4. After an admin has taken a case back below "filed", the admin can remove its old hearing
--     dates, and a case is listed again only with a date entered after the current filing.

create or replace function public.guard_hearing_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  floor_date date;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  is_admin boolean := public.has_role('admin');
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return coalesce(new, old);
  end if;
  select status, created_at into c from public.cases where id = coalesce(new.case_id, old.case_id);
  if c.status is null or c.status not in ('filed', 'listed') then
    -- A case taken back below "filed": an admin clears the old diary, nothing else.
    if tg_op = 'DELETE' and is_admin and c.status is not null and c.status <> 'disposed' then
      return old;
    end if;
    raise exception 'hearing dates are kept for a suit in court that is not yet disposed' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then
    if old.outcome is not null then
      raise exception 'a hearing that has been written up cannot be deleted' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.case_id is distinct from old.case_id or new.org_id is distinct from old.org_id
       or new.created_by is distinct from old.created_by then
      raise exception 'a hearing stays with its case' using errcode = 'insufficient_privilege';
    end if;
    if old.outcome is not null then
      if new.outcome is null or new.hearing_date is distinct from old.hearing_date then
        raise exception 'a hearing that has been written up keeps its date and outcome' using errcode = 'insufficient_privilege';
      end if;
      if new.outcome is distinct from old.outcome and not is_admin then
        raise exception 'only an admin can correct what was written for a hearing' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' or new.hearing_date is distinct from old.hearing_date then
    select (max(f.filed_at) at time zone 'Asia/Kolkata')::date into floor_date
      from public.filings f where f.case_id = new.case_id and f.status = 'filed';
    floor_date := coalesce(floor_date, (c.created_at at time zone 'Asia/Kolkata')::date);
    if new.hearing_date < floor_date or new.hearing_date > today + 730 then
      raise exception 'hearing date must be on or after the filing and within two years' using errcode = 'check_violation';
    end if;
  end if;
  if new.outcome is not null and new.hearing_date > today then
    raise exception 'the outcome is written on or after the hearing date' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- A listed case whose last date is removed is "filed" again.
create or replace function public.hearing_unlists_case() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.cases set status = 'filed'
   where id = old.case_id and status = 'listed'
     and not exists (select 1 from public.hearings h where h.case_id = old.case_id);
  return null;
end $$;
revoke execute on function public.hearing_unlists_case() from public, anon, authenticated;
create trigger hearings_unlist_case after delete on public.hearings
for each row execute function public.hearing_unlists_case();

create or replace function public.guard_case_court_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  filed_on date;
  filed_row timestamptz;
begin
  if (new.disposed_on is not null or new.disposal is not null or new.disposal_note is not null)
     and new.status <> 'disposed' then
    raise exception 'disposal details belong to a disposed case' using errcode = 'check_violation';
  end if;
  if current_setting('role', true) is distinct from 'authenticated' or tg_op = 'INSERT' then
    return new;
  end if;
  select (max(f.filed_at) at time zone 'Asia/Kolkata')::date, max(f.created_at) into filed_on, filed_row
    from public.filings f where f.case_id = new.id and f.status = 'filed';
  -- Nested: the first hearing date lists the case, removing the last one un-lists it.
  if new.status = 'listed' and old.status is distinct from 'listed' and not exists (
       select 1 from public.hearings h
        where h.case_id = new.id and h.created_at >= coalesce(filed_row, '-infinity'::timestamptz)) then
    raise exception 'add the first hearing date' using errcode = 'check_violation';
  end if;
  if new.status = 'disposed' then
    if new.disposed_on is null or new.disposal is null then
      raise exception 'record the date and result of the disposal' using errcode = 'check_violation';
    end if;
    if (new.disposed_on, new.disposal, new.disposal_note) is distinct from (old.disposed_on, old.disposal, old.disposal_note)
       or old.status is distinct from 'disposed' then
      if new.disposed_on > today
         or new.disposed_on < coalesce(filed_on, (new.created_at at time zone 'Asia/Kolkata')::date) then
        raise exception 'disposal date must be between the filing and today' using errcode = 'check_violation';
      end if;
      if old.status = 'disposed' and not public.has_role('admin') then
        raise exception 'only an admin can change a recorded disposal' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  return new;
end $$;

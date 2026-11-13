-- One file opens one case: "Open case" first claims the intake (opening_at), so a double click or a
-- retry after a partial failure cannot open a second case from the same file. A claim is released
-- only while the intake is still read/failed (nothing was opened); "used" needs the claim.
alter table public.case_intakes add column opening_at timestamptz;

create or replace function public.guard_case_intake() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('role', true) <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'reading' or new.case_id is not null or new.pages is not null or new.opening_at is not null then
      raise exception 'a new intake starts reading, with no case yet' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.org_id <> old.org_id or new.created_by <> old.created_by
     or new.storage_path <> old.storage_path or new.provider_job_id <> old.provider_job_id then
    raise exception 'an intake keeps its office, owner, file and job' using errcode = 'insufficient_privilege';
  end if;
  -- reading -> read | failed | discarded; read | failed -> used | discarded
  if new.status is distinct from old.status and not (
       (old.status = 'reading' and new.status in ('read', 'failed', 'discarded'))
    or (old.status in ('read', 'failed') and new.status in ('used', 'discarded'))
  ) then
    raise exception 'an intake cannot go from % to %', old.status, new.status using errcode = 'check_violation';
  end if;
  -- The claim: set once on a read (or failed) intake, released only while nothing was opened.
  if new.opening_at is distinct from old.opening_at then
    if not (old.status in ('read', 'failed') and new.status = old.status
            and ((old.opening_at is null and new.opening_at is not null) or (old.opening_at is not null and new.opening_at is null))) then
      raise exception 'an intake is claimed once, before its case is opened' using errcode = 'check_violation';
    end if;
    if new.opening_at is not null then
      new.opening_at := now();
    end if;
  end if;
  if new.status = 'used' and old.status <> 'used' and old.opening_at is null then
    raise exception 'claim the intake before opening its case' using errcode = 'check_violation';
  end if;
  if new.case_id is distinct from old.case_id and not (old.case_id is null and new.status = 'used' and old.status <> 'used') then
    raise exception 'an intake is linked to its case once, when the case is opened' using errcode = 'check_violation';
  end if;
  if old.pages is not null and new.pages is distinct from old.pages then
    raise exception 'the page count of a read file does not change' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.guard_case_intake() from public, anon, authenticated;

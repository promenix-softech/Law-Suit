-- An upload can be dropped while the AI is still reading it (reading -> discarded), so a file the
-- admin no longer wants never lingers as "reading". Otherwise the same rules as 20261114000000.
create or replace function public.guard_case_intake() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('role', true) <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'reading' or new.case_id is not null or new.pages is not null then
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
  if new.case_id is distinct from old.case_id and not (old.case_id is null and new.status = 'used' and old.status <> 'used') then
    raise exception 'an intake is linked to its case once, when the case is opened' using errcode = 'check_violation';
  end if;
  if old.pages is not null and new.pages is distinct from old.pages then
    raise exception 'the page count of a read file does not change' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.guard_case_intake() from public, anon, authenticated;

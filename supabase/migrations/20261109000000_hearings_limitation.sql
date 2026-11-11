-- After filing: the hearing diary, the disposal of the suit, and the events that restart
-- limitation (written acknowledgement, part-payment). Dates are computed in packages/domain
-- (hearings.ts, deadlines.ts); the database keeps the records honest:
--  1. Hearing dates are written only for a suit in court (filed / listed) by someone who may edit
--     the case; the first date moves the case to "listed"; an outcome is written only once the
--     date has come, and a written-up date is never deleted or re-dated.
--  2. A case is "listed" only with a hearing date, and "disposed" only with its date and result;
--     a recorded disposal is changed by an admin only.
--  3. Limitation events are never dated in the future.
--  4. An admin correcting a filing record is held to the same date range as the first entry.

-- A suit settled or withdrawn before its first date is disposed straight from "filed".
-- Mirrors packages/domain/src/lifecycle.ts.
create or replace function public.case_transition_ok(f public.case_status, t public.case_status, needs_12a boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case f
    when 'bank_call'         then t in ('case_created')
    when 'case_created'      then t in ('docs_uploaded')
    when 'docs_uploaded'     then t in ('extraction_review')
    when 'extraction_review' then t in ('notice_generated', 'drafting')
    when 'notice_generated'  then t in ('notice_sent')
    when 'notice_sent'       then t = 'mediation_12a' or (t = 'drafting' and not coalesce(needs_12a, false))
    when 'mediation_12a'     then t in ('drafting')
    when 'drafting'          then t in ('in_approval')
    when 'in_approval'       then t in ('approved', 'drafting')
    when 'approved'          then t in ('notary_stamp', 'drafting')
    when 'notary_stamp'      then t in ('efiling_ready')
    when 'efiling_ready'     then t in ('filed')
    when 'filed'             then t in ('listed', 'disposed')
    when 'listed'            then t in ('disposed')
    else false
  end
$$;

-- ---------------------------------------------------------------- hearings
create table public.hearings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  hearing_date date not null,
  purpose text not null check (purpose in (
    'first_date', 'summons', 'written_statement', 'issues', 'evidence_plaintiff',
    'evidence_defendant', 'arguments', 'judgment', 'interim', 'other')),
  -- What happened on the date; null until someone writes it up.
  outcome text check (outcome is null or char_length(btrim(outcome)) between 1 and 2000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, hearing_date)
);
create index hearings_org_id_idx on public.hearings (org_id);
create index hearings_created_by_idx on public.hearings (created_by);
create index hearings_open_idx on public.hearings (hearing_date) where outcome is null;

alter table public.hearings enable row level security;
alter table public.hearings force row level security;

create policy hearings_read on public.hearings for select to authenticated
  using (public.can_see_case(case_id));
create policy hearings_insert on public.hearings for insert to authenticated
  with check (org_id = public.current_org_id() and public.can_edit_case(case_id) and created_by = (select auth.uid()));
create policy hearings_update on public.hearings for update to authenticated
  using (public.can_edit_case(case_id))
  with check (org_id = public.current_org_id() and public.can_edit_case(case_id));
create policy hearings_delete on public.hearings for delete to authenticated
  using (public.can_edit_case(case_id));

create trigger hearings_updated_at before update on public.hearings
for each row execute function public.set_updated_at();
create trigger hearings_audit after insert or update or delete on public.hearings
for each row execute function public.audit_row();
create trigger same_org before insert or update on public.hearings
for each row execute function public.enforce_same_org('case_id', 'cases', 'created_by', 'user');
create trigger hearings_created_now before insert or update on public.hearings
for each row execute function public.force_created_now();

create or replace function public.guard_hearing_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return coalesce(new, old);
  end if;
  select status, created_at into c from public.cases where id = coalesce(new.case_id, old.case_id);
  if c.status is null or c.status not in ('filed', 'listed') then
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
    if old.outcome is not null and new.hearing_date is distinct from old.hearing_date then
      raise exception 'a hearing that has been written up keeps its date' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if (tg_op = 'INSERT' or new.hearing_date is distinct from old.hearing_date)
     and (new.hearing_date < (c.created_at at time zone 'Asia/Kolkata')::date or new.hearing_date > today + 730) then
    raise exception 'hearing date must be after the case was opened and within two years' using errcode = 'check_violation';
  end if;
  if new.outcome is not null and new.hearing_date > today then
    raise exception 'the outcome is written on or after the hearing date' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.guard_hearing_row() from public, anon, authenticated;
create trigger hearings_guard_row before insert or update or delete on public.hearings
for each row execute function public.guard_hearing_row();

-- The first hearing date lists the case.
create or replace function public.hearing_lists_case() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.cases set status = 'listed' where id = new.case_id and status = 'filed';
  return null;
end $$;
revoke execute on function public.hearing_lists_case() from public, anon, authenticated;
create trigger hearings_list_case after insert on public.hearings
for each row execute function public.hearing_lists_case();

-- Writes up a passed date and, in the same transaction, enters the next one. Runs as the caller.
create or replace function public.record_hearing(
  p_hearing_id uuid, p_outcome text, p_next_date date, p_next_purpose text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  h record;
begin
  select id, org_id, case_id into h from public.hearings where id = p_hearing_id for update;
  if h.id is null then
    raise exception 'hearing not found' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_outcome), '') = '' then
    raise exception 'write what happened on the date' using errcode = 'check_violation';
  end if;
  update public.hearings set outcome = btrim(p_outcome) where id = h.id;
  if p_next_date is not null then
    insert into public.hearings (org_id, case_id, hearing_date, purpose)
    values (h.org_id, h.case_id, p_next_date, coalesce(nullif(p_next_purpose, ''), 'other'));
  end if;
end $$;
revoke execute on function public.record_hearing(uuid, text, date, text) from public, anon;
grant execute on function public.record_hearing(uuid, text, date, text) to authenticated;

-- ---------------------------------------------------------------- disposal
alter table public.cases
  add column disposed_on date,
  add column disposal text check (disposal is null or disposal in (
    'decreed', 'decreed_ex_parte', 'settled', 'dismissed', 'withdrawn', 'other')),
  add column disposal_note text check (disposal_note is null or char_length(disposal_note) <= 500);

create or replace function public.guard_case_court_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if (new.disposed_on is not null or new.disposal is not null or new.disposal_note is not null)
     and new.status <> 'disposed' then
    raise exception 'disposal details belong to a disposed case' using errcode = 'check_violation';
  end if;
  if current_setting('role', true) is distinct from 'authenticated' or tg_op = 'INSERT' then
    return new;
  end if;
  if new.status = 'listed' and old.status is distinct from 'listed'
     and not exists (select 1 from public.hearings h where h.case_id = new.id) then
    raise exception 'add the first hearing date' using errcode = 'check_violation';
  end if;
  if new.status = 'disposed' then
    if new.disposed_on is null or new.disposal is null then
      raise exception 'record the date and result of the disposal' using errcode = 'check_violation';
    end if;
    if new.disposed_on > today or new.disposed_on < (new.created_at at time zone 'Asia/Kolkata')::date then
      raise exception 'disposal date must be between the case''s opening and today' using errcode = 'check_violation';
    end if;
    if old.status = 'disposed' and not public.has_role('admin')
       and (new.disposed_on, new.disposal, new.disposal_note) is distinct from (old.disposed_on, old.disposal, old.disposal_note) then
      raise exception 'only an admin can change a recorded disposal' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_case_court_stage() from public, anon, authenticated;
create trigger cases_guard_court_stage before insert or update on public.cases
for each row execute function public.guard_case_court_stage();

-- ---------------------------------------------------------------- limitation events
create table public.limitation_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  case_id uuid not null references public.cases (id) on delete cascade,
  kind text not null check (kind in ('acknowledgment', 'part_payment')),
  event_date date not null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, kind, event_date)
);
create index limitation_events_org_id_idx on public.limitation_events (org_id);
create index limitation_events_created_by_idx on public.limitation_events (created_by);

alter table public.limitation_events enable row level security;
alter table public.limitation_events force row level security;

create policy limitation_events_read on public.limitation_events for select to authenticated
  using (public.can_see_case(case_id));
create policy limitation_events_insert on public.limitation_events for insert to authenticated
  with check (org_id = public.current_org_id() and public.can_edit_case(case_id) and created_by = (select auth.uid()));
create policy limitation_events_update on public.limitation_events for update to authenticated
  using (public.can_edit_case(case_id))
  with check (org_id = public.current_org_id() and public.can_edit_case(case_id));
create policy limitation_events_delete on public.limitation_events for delete to authenticated
  using (public.can_edit_case(case_id));

create trigger limitation_events_updated_at before update on public.limitation_events
for each row execute function public.set_updated_at();
create trigger limitation_events_audit after insert or update or delete on public.limitation_events
for each row execute function public.audit_row();
create trigger same_org before insert or update on public.limitation_events
for each row execute function public.enforce_same_org('case_id', 'cases', 'created_by', 'user');
create trigger limitation_events_created_now before insert or update on public.limitation_events
for each row execute function public.force_created_now();

create or replace function public.guard_limitation_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.case_id is distinct from old.case_id or new.org_id is distinct from old.org_id
                           or new.created_by is distinct from old.created_by) then
    raise exception 'a limitation event stays with its case' using errcode = 'insufficient_privilege';
  end if;
  if new.event_date > (now() at time zone 'Asia/Kolkata')::date or new.event_date < date '1990-01-01' then
    raise exception 'the date of an acknowledgement or payment cannot be in the future' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.guard_limitation_event() from public, anon, authenticated;
create trigger limitation_events_guard before insert or update on public.limitation_events
for each row execute function public.guard_limitation_event();

-- ---------------------------------------------------------------- filing corrections
-- An admin's correction of a filing date is held to the same range as the first entry.
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
  if tg_op = 'UPDATE' and (new.filed_at is distinct from old.filed_at or new.efiling_no is distinct from old.efiling_no) then
    select created_at into c from public.cases where id = new.case_id;
    if new.filed_at is null or coalesce(btrim(new.efiling_no), '') = ''
       or (new.filed_at at time zone 'Asia/Kolkata')::date > today
       or (new.filed_at at time zone 'Asia/Kolkata')::date < (c.created_at at time zone 'Asia/Kolkata')::date then
      raise exception 'a filing keeps its e-filing number and a date between the case''s opening and today' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;

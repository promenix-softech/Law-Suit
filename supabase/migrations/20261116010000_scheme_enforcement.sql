-- Security review of 16 Nov:
-- 1. A blocking scheme was checked only for signed-in users, so cases opened by the worker from a
--    bulk upload (service role) went past it. It is now checked whoever opens the case.
-- 2. Two cases (or two people) added at the same moment could each pass the count: the count is
--    taken under a per-office lock.
-- 3. ai_quota_ok() said yes to a paused office (its count reads as zero). It now says no.
-- 4. The pause columns cannot be updated by signed-in users even if a policy is ever added.

create or replace function public.enforce_scheme_on_case() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.office_schemes%rowtype;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  used bigint;
begin
  select * into s from public.office_schemes where org_id = new.org_id;
  if not found or s.on_limit <> 'block' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('scheme:' || new.org_id::text));
  if today < s.valid_from then
    raise exception 'scheme: not started' using errcode = 'CS001';
  end if;
  if s.valid_until is not null and today > s.valid_until then
    raise exception 'scheme: expired' using errcode = 'CS001';
  end if;
  if s.cases_per_month is not null then
    select count(*) into used from public.cases c where c.org_id = new.org_id
       and (c.created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', today)::date;
    if used >= s.cases_per_month then
      raise exception 'scheme: monthly limit' using errcode = 'CS001';
    end if;
  end if;
  if s.cases_per_year is not null then
    select count(*) into used from public.cases c where c.org_id = new.org_id
       and (c.created_at at time zone 'Asia/Kolkata')::date >= public.scheme_year_start(s.valid_from, today);
    if used >= s.cases_per_year then
      raise exception 'scheme: yearly limit' using errcode = 'CS001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.enforce_scheme_on_case() from public, anon, authenticated;

create or replace function public.enforce_scheme_seats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed int;
begin
  select seats into allowed from public.office_schemes where org_id = new.org_id;
  if allowed is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('seats:' || new.org_id::text));
  if (select count(*) from public.profiles p where p.org_id = new.org_id) >= allowed then
    raise exception 'scheme: seats' using errcode = 'CS001';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_scheme_seats() from public, anon, authenticated;

create or replace function public.ai_quota_ok(per_user_hour int default 60, per_org_day int default 1000)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    public.current_org_id() is not null
    and
    (select count(*) from public.ocr_jobs
      where created_by = auth.uid() and created_at > now() - interval '1 hour')
    + (select count(*) from public.case_intakes
      where created_by = auth.uid() and created_at > now() - interval '1 hour') < per_user_hour
    and
    (select count(*) from public.ocr_jobs
      where org_id = public.current_org_id() and created_at > now() - interval '1 day')
    + (select count(*) from public.case_intakes
      where org_id = public.current_org_id() and created_at > now() - interval '1 day')
      < coalesce((select s.ai_jobs_per_day from public.office_schemes s where s.org_id = public.current_org_id()), per_org_day)
$$;

revoke update (suspended_at, suspended_reason) on public.organizations from authenticated, anon;

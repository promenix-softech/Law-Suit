-- Super admin (Promenix, above every office): who they are, each office's scheme, its usage by
-- month and by year, and the switches that belong in the super admin's hands.
--
-- Principles
--   * A super admin is a row in platform_admins, written only by the service role. Nothing in the
--     app can make one.
--   * The super admin works through the functions below. They return counts and settings, never
--     a case, a party, a paper or any other content of an office: no RLS policy on an office's
--     tables is widened.
--   * What the super admin changes is written to the office's own audit chain.

-- ------------------------------------------------------------------ 1. who is a super admin
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
-- A super admin can see that they are one. No insert / update / delete policy: service role only.
create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));
comment on table public.platform_admins is 'Super admins (Promenix). Written by the service role only; no org_id: it is above the offices';

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ------------------------------------------------------------------ 2. pausing an office
alter table public.organizations
  add column suspended_at timestamptz,
  add column suspended_reason text check (char_length(suspended_reason) <= 300);
comment on column public.organizations.suspended_at is 'Set by the super admin: the office''s people can sign in but see and change nothing';
-- (The new columns are not in the column grants of 20261026010000 / 20261102000000: an office
--  learns that it is paused through my_access(), nothing else.)

-- One switch for the whole database: every policy asks current_org_id() or has_role(), so a
-- paused office's people get no rows and can write none — through the app or straight at the API.
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.org_id from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid() and o.suspended_at is null
$$;

create or replace function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.org_id = ur.org_id
    join public.organizations o on o.id = p.org_id and o.suspended_at is null
    where ur.user_id = auth.uid() and ur.role = r
  )
$$;

-- What the app shell needs to know about the person, paused office or not.
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'office', o.name,
    'suspended', o.suspended_at is not null,
    'reason', o.suspended_reason,
    'platform_admin', exists (select 1 from public.platform_admins pa where pa.user_id = p.id)
  )
  from public.profiles p join public.organizations o on o.id = p.org_id
  where p.id = auth.uid()
$$;
revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ------------------------------------------------------------------ 3. an office's scheme
create table public.office_schemes (
  id uuid primary key default gen_random_uuid(),
  -- One scheme per office; its history is in the audit chain.
  org_id uuid not null unique references public.organizations (id),
  scheme_name text not null check (char_length(scheme_name) between 2 and 60),
  -- How the office pays: month by month, or a year in advance.
  period text not null check (period in ('monthly', 'yearly')),
  -- New cases the scheme covers; null = no limit of that kind.
  cases_per_month int check (cases_per_month between 0 and 100000),
  cases_per_year int check (cases_per_year between 0 and 1200000),
  valid_from date not null,
  valid_until date check (valid_until >= valid_from),
  -- At the limit, or after valid_until: only warn, or refuse new cases.
  on_limit text not null default 'warn' check (on_limit in ('warn', 'block')),
  -- AI readings (OCR / extraction / new-case files) per day; null = the platform's default.
  ai_jobs_per_day int check (ai_jobs_per_day between 0 and 100000),
  -- People the office may have; null = no limit.
  seats int check (seats between 1 and 1000),
  note text check (char_length(note) <= 500),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.office_schemes enable row level security;
alter table public.office_schemes force row level security;
create trigger office_schemes_updated_at before update on public.office_schemes
for each row execute function public.set_updated_at();
create trigger office_schemes_audit after insert or update or delete on public.office_schemes
for each row execute function public.audit_row();
-- The office's admin may read its own scheme. Nobody writes it directly: platform_set_scheme().
create policy office_schemes_read on public.office_schemes for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role('admin')));
comment on table public.office_schemes is 'Scheme of each office (monthly / yearly, allowances, validity). Written by the super admin through platform_set_scheme()';

create index if not exists cases_org_created_idx on public.cases (org_id, created_at);

-- The scheme year the office is in today: valid_from moved forward by whole years.
create or replace function public.scheme_year_start(valid_from date, today date) returns date
language sql immutable set search_path = '' as $$
  select (valid_from + make_interval(years => greatest(0, extract(year from age(today, valid_from))::int)))::date
$$;

-- ------------------------------------------------------------------ 4. scheme and usage, read
-- One office (its own admin, or the super admin) or — with no argument — every office (super
-- admin only). Counts only.
create or replace function public.office_scheme_state(p_org uuid default null)
returns table (
  id uuid, name text, slug text, created_at timestamptz,
  suspended_at timestamptz, suspended_reason text, is_platform boolean,
  scheme_name text, period text, cases_per_month int, cases_per_year int,
  valid_from date, valid_until date, on_limit text, ai_jobs_per_day int, seats int, note text,
  scheme_updated_at timestamptz,
  today date, year_start date,
  users bigint, cases_total bigint, cases_month bigint, cases_year bigint,
  ai_jobs_today bigint, ai_pages_month bigint, last_case_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with t as (select (now() at time zone 'Asia/Kolkata')::date as today)
  select
    o.id, o.name, o.slug, o.created_at,
    o.suspended_at, o.suspended_reason,
    exists (select 1 from public.platform_admins pa join public.profiles p on p.id = pa.user_id where p.org_id = o.id),
    s.scheme_name, s.period, s.cases_per_month, s.cases_per_year,
    s.valid_from, s.valid_until, s.on_limit, s.ai_jobs_per_day, s.seats, s.note,
    s.updated_at,
    t.today, y.year_start,
    (select count(*) from public.profiles p where p.org_id = o.id),
    (select count(*) from public.cases c where c.org_id = o.id),
    (select count(*) from public.cases c where c.org_id = o.id
       and (c.created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', t.today)::date),
    (select count(*) from public.cases c where c.org_id = o.id
       and (c.created_at at time zone 'Asia/Kolkata')::date >= y.year_start),
    (select count(*) from public.ocr_jobs j where j.org_id = o.id and j.created_at > now() - interval '1 day')
      + (select count(*) from public.case_intakes i where i.org_id = o.id and i.created_at > now() - interval '1 day'),
    (select coalesce(sum(u.qty), 0)::bigint from public.usage_events u where u.org_id = o.id and u.kind = 'ocr_page'
       and (u.created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', t.today)::date),
    (select max(c.created_at) from public.cases c where c.org_id = o.id)
  from public.organizations o
  cross join t
  left join public.office_schemes s on s.org_id = o.id
  cross join lateral (select public.scheme_year_start(coalesce(s.valid_from, o.created_at::date), t.today) as year_start) y
  where (p_org is null and public.is_platform_admin())
     or (o.id = p_org and (public.is_platform_admin() or (p_org = public.current_org_id() and public.has_role('admin'))))
  order by o.name
$$;
revoke execute on function public.office_scheme_state(uuid) from public, anon;
grant execute on function public.office_scheme_state(uuid) to authenticated;

-- Usage of one office month by month (IST), oldest first. A suit pack counts once per case, in
-- the month its first e-filing bundle was built — the same rule as billable_suit_packs().
create or replace function public.office_usage_monthly(p_org uuid, p_months int default 12)
returns table (month date, cases bigint, suit_packs bigint, ai_pages bigint, ai_cost_paise bigint)
language sql stable security definer set search_path = '' as $$
  with m as (
    select (date_trunc('month', now() at time zone 'Asia/Kolkata') - make_interval(months => g))::date as month
    from generate_series(0, least(greatest(coalesce(p_months, 12), 1), 36) - 1) g
  )
  select
    m.month,
    (select count(*) from public.cases c where c.org_id = p_org
       and date_trunc('month', c.created_at at time zone 'Asia/Kolkata')::date = m.month),
    (select count(*) from (
       select min(u.created_at) as first_at from public.usage_events u
       where u.org_id = p_org and u.kind = 'suit_pack' and u.billing_case_id is not null
       group by u.billing_case_id) f
     where date_trunc('month', f.first_at at time zone 'Asia/Kolkata')::date = m.month),
    (select coalesce(sum(u.qty), 0)::bigint from public.usage_events u where u.org_id = p_org and u.kind = 'ocr_page'
       and date_trunc('month', u.created_at at time zone 'Asia/Kolkata')::date = m.month),
    (select coalesce(sum(u.cost_paise), 0)::bigint from public.usage_events u
     where u.org_id = p_org and u.kind in ('ocr_page', 'llm_tokens')
       and date_trunc('month', u.created_at at time zone 'Asia/Kolkata')::date = m.month)
  from m
  where public.is_platform_admin() or (p_org = public.current_org_id() and public.has_role('admin'))
  order by m.month
$$;
revoke execute on function public.office_usage_monthly(uuid, int) from public, anon;
grant execute on function public.office_usage_monthly(uuid, int) to authenticated;

-- ------------------------------------------------------------------ 5. the super admin's switches
create or replace function public.platform_set_scheme(
  p_org uuid, p_scheme_name text, p_period text, p_cases_per_month int, p_cases_per_year int,
  p_valid_from date, p_valid_until date, p_on_limit text, p_ai_jobs_per_day int, p_seats int, p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin can set an office''s scheme' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'office not found' using errcode = '23503';
  end if;
  insert into public.office_schemes as s
    (org_id, scheme_name, period, cases_per_month, cases_per_year, valid_from, valid_until, on_limit, ai_jobs_per_day, seats, note, updated_by)
  values
    (p_org, btrim(p_scheme_name), p_period, p_cases_per_month, p_cases_per_year, p_valid_from, p_valid_until, p_on_limit,
     p_ai_jobs_per_day, p_seats, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (org_id) do update set
    scheme_name = excluded.scheme_name, period = excluded.period,
    cases_per_month = excluded.cases_per_month, cases_per_year = excluded.cases_per_year,
    valid_from = excluded.valid_from, valid_until = excluded.valid_until, on_limit = excluded.on_limit,
    ai_jobs_per_day = excluded.ai_jobs_per_day, seats = excluded.seats, note = excluded.note,
    updated_by = excluded.updated_by;
end $$;
revoke execute on function public.platform_set_scheme(uuid, text, text, int, int, date, date, text, int, int, text) from public, anon;
grant execute on function public.platform_set_scheme(uuid, text, text, int, int, date, date, text, int, int, text) to authenticated;

create or replace function public.platform_set_suspended(p_org uuid, p_suspended boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin can pause an office' using errcode = '42501';
  end if;
  if p_suspended and exists (
       select 1 from public.platform_admins pa join public.profiles p on p.id = pa.user_id where p.org_id = p_org) then
    raise exception 'the super admin''s own office cannot be paused' using errcode = '23514';
  end if;
  if p_suspended and reason is null then
    raise exception 'say why the office is paused' using errcode = '23514';
  end if;
  update public.organizations
     set suspended_at = case when p_suspended then coalesce(suspended_at, now()) else null end,
         suspended_reason = case when p_suspended then reason else null end
   where id = p_org;
  if not found then
    raise exception 'office not found' using errcode = '23503';
  end if;
end $$;
revoke execute on function public.platform_set_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.platform_set_suspended(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------------ 6. what the scheme enforces
-- New cases: refused at the limit or after the validity only when the scheme says 'block'.
-- SQLSTATE CS001 so the app can tell the person exactly why.
create or replace function public.enforce_scheme_on_case() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.office_schemes%rowtype;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  used bigint;
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return new;
  end if;
  select * into s from public.office_schemes where org_id = new.org_id;
  if not found or s.on_limit <> 'block' then
    return new;
  end if;
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
create trigger cases_scheme_limit before insert on public.cases
for each row execute function public.enforce_scheme_on_case();

-- Seats: an office cannot have more people than its scheme allows (whoever adds them).
create or replace function public.enforce_scheme_seats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed int;
begin
  select seats into allowed from public.office_schemes where org_id = new.org_id;
  if allowed is not null and (select count(*) from public.profiles p where p.org_id = new.org_id) >= allowed then
    raise exception 'scheme: seats' using errcode = 'CS001';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_scheme_seats() from public, anon, authenticated;
create trigger profiles_scheme_seats before insert on public.profiles
for each row execute function public.enforce_scheme_seats();

-- AI readings per day: the office's own cap, when its scheme has one, instead of the default.
create or replace function public.ai_quota_ok(per_user_hour int default 60, per_org_day int default 1000)
returns boolean language sql stable security definer set search_path = '' as $$
  select
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

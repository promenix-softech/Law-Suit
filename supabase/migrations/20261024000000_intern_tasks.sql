-- Intern task board (Promenix internal; used by the "Promenix Tasks" Android app).
-- Not tenant data: no org_id. Interns see only their own tasks and updates; admins (the
-- owners) see and manage everything. Membership is managed by the owners in SQL / the
-- dashboard, never from the app. Interns cannot read any Civil Suits table: they have no
-- profile or role there, so every Civil Suits policy denies them.

create type public.intern_task_status as enum ('todo', 'in_progress', 'in_review', 'done');
create type public.intern_product as enum ('civil_suits', 'homigo', 'both');

create table public.intern_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 80),
  role text not null check (role in ('intern', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.intern_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 120),
  details text not null default '' check (length(details) <= 4000),
  acceptance text not null default '' check (length(acceptance) <= 2000),
  product public.intern_product not null,
  priority smallint not null default 2 check (priority between 1 and 3),
  assignee_id uuid not null references public.intern_members (user_id),
  status public.intern_task_status not null default 'todo',
  due_on date,
  link text check (link is null or link ~ '^https://github\.com/promenix-softech/[A-Za-z0-9._/#-]{1,200}$'),
  review_note text not null default '' check (length(review_note) <= 1000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index intern_tasks_assignee_idx on public.intern_tasks (assignee_id, status);

create table public.intern_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.intern_tasks (id) on delete cascade,
  actor_id uuid references auth.users (id),
  from_status public.intern_task_status,
  to_status public.intern_task_status not null,
  at timestamptz not null default now()
);
create index intern_task_events_task_idx on public.intern_task_events (task_id, at desc);

create table public.intern_daily_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.intern_members (user_id),
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  done text not null check (length(btrim(done)) between 1 and 1000),
  plan text not null check (length(btrim(plan)) between 1 and 1000),
  blockers text not null default '' check (length(blockers) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create trigger intern_tasks_updated_at before update on public.intern_tasks
for each row execute function public.set_updated_at();
create trigger intern_daily_updates_updated_at before update on public.intern_daily_updates
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- helpers
create or replace function public.intern_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.intern_members where user_id = auth.uid() and active
$$;
revoke execute on function public.intern_role() from public, anon;
grant execute on function public.intern_role() to authenticated;

-- Interns may only move their own task along todo → in_progress → in_review (and back to
-- in_progress); everything else, including 'done', is the admin's call.
create or replace function public.guard_intern_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' or public.intern_role() = 'admin' then
    return new;
  end if;
  if (new.title, new.details, new.acceptance, new.product, new.priority, new.assignee_id,
      new.due_on, new.link, new.review_note, new.created_by)
     is distinct from
     (old.title, old.details, old.acceptance, old.product, old.priority, old.assignee_id,
      old.due_on, old.link, old.review_note, old.created_by) then
    raise exception 'interns can only change the task status' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'todo' and new.status = 'in_progress')
    or (old.status = 'in_progress' and new.status = 'in_review')
    or (old.status = 'in_review' and new.status = 'in_progress')) then
    raise exception 'task cannot move from % to %', old.status, new.status using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger intern_tasks_guard before update on public.intern_tasks
for each row execute function public.guard_intern_task();
revoke execute on function public.guard_intern_task() from public, anon, authenticated;

create or replace function public.log_intern_task_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.intern_task_events (task_id, actor_id, from_status, to_status)
    values (new.id, auth.uid(), case when tg_op = 'UPDATE' then old.status end, new.status);
  end if;
  return null;
end $$;
create trigger intern_tasks_events after insert or update of status on public.intern_tasks
for each row execute function public.log_intern_task_event();
revoke execute on function public.log_intern_task_event() from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.intern_members enable row level security;
alter table public.intern_members force row level security;
alter table public.intern_tasks enable row level security;
alter table public.intern_tasks force row level security;
alter table public.intern_task_events enable row level security;
alter table public.intern_task_events force row level security;
alter table public.intern_daily_updates enable row level security;
alter table public.intern_daily_updates force row level security;

revoke all on public.intern_members, public.intern_tasks, public.intern_task_events,
  public.intern_daily_updates from anon;

create policy intern_members_read on public.intern_members for select to authenticated
  using (user_id = auth.uid() or public.intern_role() = 'admin');

create policy intern_tasks_read on public.intern_tasks for select to authenticated
  using (public.intern_role() = 'admin'
         or (assignee_id = auth.uid() and public.intern_role() = 'intern'));
create policy intern_tasks_admin_insert on public.intern_tasks for insert to authenticated
  with check (public.intern_role() = 'admin' and created_by = auth.uid());
create policy intern_tasks_update on public.intern_tasks for update to authenticated
  using (public.intern_role() = 'admin'
         or (assignee_id = auth.uid() and public.intern_role() = 'intern'))
  with check (public.intern_role() = 'admin'
              or (assignee_id = auth.uid() and public.intern_role() = 'intern'));
create policy intern_tasks_admin_delete on public.intern_tasks for delete to authenticated
  using (public.intern_role() = 'admin');

create policy intern_task_events_read on public.intern_task_events for select to authenticated
  using (exists (select 1 from public.intern_tasks t where t.id = task_id));

create policy intern_updates_read on public.intern_daily_updates for select to authenticated
  using (public.intern_role() = 'admin'
         or (user_id = auth.uid() and public.intern_role() is not null));
create policy intern_updates_insert on public.intern_daily_updates for insert to authenticated
  with check (user_id = auth.uid() and public.intern_role() is not null
              and day = (now() at time zone 'Asia/Kolkata')::date);
create policy intern_updates_update on public.intern_daily_updates for update to authenticated
  using (user_id = auth.uid() and day = (now() at time zone 'Asia/Kolkata')::date)
  with check (user_id = auth.uid() and day = (now() at time zone 'Asia/Kolkata')::date);

-- Members and events are written only by the owners (SQL) and by the trigger above.
revoke insert, update, delete on public.intern_members, public.intern_task_events from authenticated;
revoke delete on public.intern_daily_updates from authenticated;

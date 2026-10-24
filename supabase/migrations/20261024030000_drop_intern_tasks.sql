-- The Promenix intern task board (20261024000000 / 20261024010000) is not wanted in Civil Suits:
-- remove its tables, functions and types. The Civil Suits field app uses public.tasks instead.
drop table if exists public.intern_daily_updates;
drop table if exists public.intern_task_events;
drop table if exists public.intern_tasks;
drop table if exists public.intern_members;
drop function if exists public.guard_intern_task();
drop function if exists public.log_intern_task_event();
drop function if exists public.intern_role();
drop type if exists public.intern_task_status;
drop type if exists public.intern_product;

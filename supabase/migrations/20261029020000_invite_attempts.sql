-- Every invitation attempt from the Team page, successful or not. The invite-user edge function
-- counts these per office per day, so refused or failed attempts (e.g. probing whether an email has
-- an account elsewhere) use up the limit too. The email is stored only as a SHA-256 hash.
-- Append-only: written by the edge function (service role) only; admins of the office can read.
create table public.invite_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  invited_by uuid not null references auth.users (id),
  email_sha256 text not null check (email_sha256 ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('sent', 'existing_member', 'refused', 'failed')),
  created_at timestamptz not null default now()
);
create index invite_attempts_org_day on public.invite_attempts (org_id, created_at);

alter table public.invite_attempts enable row level security;
alter table public.invite_attempts force row level security;

create policy invite_attempts_read on public.invite_attempts for select to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'));
-- No insert / update / delete policy: users cannot write here, only the edge function can.

create trigger same_org before insert or update on public.invite_attempts
  for each row execute function public.enforce_same_org('invited_by', 'user');
create trigger invite_attempts_audit after insert or update or delete on public.invite_attempts
  for each row execute function public.audit_row();

---
name: supabase-rls-security
description: Multi-tenant RLS patterns, maker-checker, append-only audit, storage policies and field encryption for this project's Supabase database. Use when adding tables, policies, storage buckets or anything touching PII.
---
# Supabase RLS & security patterns

Reference implementation: `supabase/migrations/20261020000000_core_schema.sql`. Tests: `supabase/tests/rls_test.sql` (`pnpm test:db`).

## New table checklist
```sql
create table public.x (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  case_id uuid references public.cases(id) on delete cascade,  -- if case-scoped
  ...,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.x enable row level security;
alter table public.x force row level security;
create trigger x_updated_at before update on public.x for each row execute function public.set_updated_at();
create trigger x_audit after insert or update or delete on public.x for each row execute function public.audit_row();
create policy x_read  on public.x for select to authenticated using (public.can_see_case(case_id));
create policy x_write on public.x for all to authenticated
  using (public.can_edit_case(case_id))
  with check (org_id = public.current_org_id() and public.can_edit_case(case_id));
```

## Helpers
- `current_org_id()`, `has_role(role)`, `can_see_case(id)`, `can_edit_case(id)` — `security definer`, `search_path = ''`.
- Visibility: admin/approver → all org cases; drafter → assigned; field → cases where they hold a task.

## Invariants (tested)
- Approver ≠ draft author and ≠ any version author (`enforce_maker_checker` trigger).
- `audit_log`: insert only via triggers, hash chain per org, update/delete raise.
- RLS enabled on every public table.

## Storage
Private buckets only; path `org/{org_id}/case/{case_id}/...`; storage policies mirror `can_see_case`; signed URLs ≤ 300 s; virus scan before marking a document available.

## Field encryption
AES-256-GCM in server code (Node `crypto`), key from env/Vault, stored as `bytea` (`iv || tag || ciphertext`). Keep a `*_last4` column for display/search where needed. Never decrypt in the browser.

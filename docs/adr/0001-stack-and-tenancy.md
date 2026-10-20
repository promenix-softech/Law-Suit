# ADR 0001 — Stack, tenancy and where logic lives

**Status:** Accepted (2026-10-20)

## Context
One Maharashtra advocate office now, multi-office SaaS later (Phase 5). Bank data is sensitive (DPDP, bank empanelment terms). Legal amounts must be exact and auditable.

## Decision
- Next.js (Vercel) + Supabase (Postgres/RLS/Auth/Storage, Mumbai) + a Docker worker on a VPS for OCR/PDF jobs (pgmq queue).
- Multi-tenant from day one: every table carries `org_id`; RLS deny-by-default with helper functions (`current_org_id`, `has_role`, `can_see_case`, `can_edit_case`).
- Maker-checker and audit immutability are enforced in the database (triggers), not only the UI.
- Money/fee/interest logic lives in `packages/domain` as pure TypeScript functions with table-driven tests; LLMs never compute amounts.
- Money stored as integer paise; interest rates as basis points.

## Consequences
- RLS tests (`pnpm test:db`) are part of CI and the Definition of Done.
- The worker is a separate deployable; long jobs never run on Vercel functions.
- Adding a table requires policies + audit trigger + tests (see skill `supabase-rls-security`).

## Alternatives considered
- Single-tenant deployment per office — simpler now, but blocks Phase 5 and duplicates ops.
- Doing OCR/PDF in Vercel functions — timeouts and missing native tools (LibreOffice, OCRmyPDF).

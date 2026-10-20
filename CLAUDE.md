# Civil Suits — CLAUDE.md

Bank-recovery civil-suit automation for a Maharashtra panel-advocate office (multi-tenant ready).
Built by Promenix Softech LLP. Full plan: `docs/plan.md`. Current phase and open tasks: `docs/STATUS.md`.

## Non-negotiables
- **No real client data** in the repo, tests, seeds, screenshots or prompts. Synthetic data only.
- **RLS on every table**, deny by default. Never disable RLS "temporarily". Never use the secret/service key in the browser.
- **Approver ≠ Drafter**, enforced in the DB (`enforce_maker_checker` trigger), not just the UI.
- **audit_log is append-only** (hash chain). Only security-definer triggers write it.
- **Money in paise** (integer `bigint`/`number`). Rates in basis points. Dates stored UTC, shown IST.
- **Amounts, interest, court fee, limitation dates are computed in code** (`packages/domain`), never by an LLM.
- **Never invent statutory text.** Every legal paragraph comes from a versioned template; unknowns are marked `[[LEGAL_REVIEW]]`.
- Aadhaar: store last 4 digits only. PAN / account no / DOB / phone / OCR text are `*_enc` (AES-256-GCM, server-side).
- Pseudonymise before any Claude call (`{{BORROWER_1}}`, `{{ACCOUNT_1}}`); substitute real values server-side afterwards.

## Stack
- `apps/web` — Next.js 16 (App Router, TypeScript strict, Tailwind). Read `apps/web/AGENTS.md` first: this Next.js version differs from training data.
- `packages/domain` — pure, tested domain functions (court fee, 12A check, interest, DRT fee, e-filing names, lifecycle).
- `supabase/` — migrations + RLS tests (Supabase Postgres, Mumbai region).
- `apps/worker` — (Phase 1) OCR / DOCX→PDF/A worker on a VPS (LibreOffice, OCRmyPDF, qpdf). pgmq queue.
- `packages/templates` — versioned DOCX templates `{bank}/{court_type}/{doc_kind}.{lang}.docx` + manifest.
- AI: Sarvam Vision (OCR), Claude Haiku 5.5 (page classification), Claude Sonnet 5.5 (extraction + narrative). All AI calls go through one module that logs tokens/pages/cost to `usage_events`.

## Commands
```bash
pnpm install
pnpm dev                 # web app
pnpm test:unit           # vitest (domain)
pnpm typecheck
pnpm lint
pnpm test:db             # migrations + RLS tests on local Postgres (DATABASE_URL)
```

## Conventions
- zod validation on every boundary; server actions only for mutations; no client-side secrets.
- New domain logic = pure function + tests in `packages/domain` first (TDD).
- New table = migration with `org_id`, RLS policies, `updated_at` + audit triggers, and a test in `supabase/tests/rls_test.sql`.
- Never edit an applied migration; add a new one.
- Keep `packages/domain/src/lifecycle.ts` and the `case_status` enum in sync.

## Legal-format rules
See skills: `indian-civil-plaint`, `maharashtra-efiling-format`, `court-fee-maharashtra`, `marathi-legal-glossary`.
Pending legal verification (do not hard-code until confirmed): BBE Act 2026 Second Schedule wording, court-fee slabs below ₹1 lakh, welfare-stamp amount.

## Definition of Done
Tests green (unit + RLS), `security-reviewer` sign-off for anything touching auth/RLS/PII, docs updated, `docs/STATUS.md` updated.

## Agent routing
| Folder | Owner agent |
|---|---|
| `docs/requirements.md`, user stories | requirements-analyst |
| `docs/adr/`, schema design | architect |
| `supabase/`, `apps/worker`, AI module | backend-engineer |
| `apps/web` | frontend-engineer |
| `packages/templates`, PDF pipeline | docgen-specialist |
| Reviews of RLS/PII/secrets | security-reviewer |
| Tests, e2e, golden files | qa-verifier |

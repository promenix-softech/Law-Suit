# STATUS — Civil Suits

**Current phase:** 1 — Demo build (started 2026-10-20)

## Done (Phase 1, slice 1)
- [x] `amountInWordsINR` / `numberToWordsIndian` (Lakh/Crore) in domain — tested
- [x] `packages/templates`: format-neutral DocModel + demand notice v1 (EN), golden-file test; legal-consequence and 12A paragraphs flagged `[[LEGAL_REVIEW]]`
- [x] DOCX renderer (A4, TNR 14, 1.5 spacing, e-filing margins); sample in `docs/samples/`
- [x] Storage bucket `case-files` (private, 25 MB, PDF/JPG/PNG/DOCX) with RLS mirroring case visibility; tests added; applied to demo DB
- [x] Case page `/dashboard/cases/[id]`: parties, loan, claim + court fee + 12A (computed in code), scan upload, demand-notice generation (draft versions), signed links (5 min)

## Done (Phase 1, slice 2)
- [x] Approval flow enforced in DB (migration `approval_flow`): drafts become approved/returned only via an `approvals` row; decisions only on `in_approval` drafts; approved plaint → case `approved`, returned → `drafting`. RLS tests added; verified on the live demo DB (rolled back).
- [x] UI: submit for approval (drafter), approve / return with comments (approver), status badges, last decision shown; approver queue on the dashboard; new version resets a draft to `draft`
- [x] Plaint template v1 (ordinary / Order XXXVII / commercial) with court fee from code, 12A paragraph (or a filing-block flag when the report is missing), statement of truth vs verification; golden test; sample in `docs/samples/`

## Next (Phase 1)
- [ ] Demand notice in Marathi (needs † glossary terms confirmed)
- [ ] Vakalatnama, affidavit/SOT templates; BBE 2026 certificate (needs gazette text)
- [ ] Notice dispatch + 12A mediation stages in the UI (feed notice date and mediation report into the plaint)
- [ ] Worker (Docker on VPS): DOCX→PDF/A, OCRmyPDF; needs a VPS
- [ ] OCR + extraction (needs SARVAM_API_KEY, ANTHROPIC_API_KEY) and review UI
- [ ] Approval flow UI (approver approves/returns drafts)
**Next milestone:** Phase 1 demo (end of week 4) — single-case upload → OCR → review → drafts → PDF/A

## Done (Phase 0)
- [x] Monorepo: pnpm workspaces (`apps/web`, `packages/domain`, `supabase/`)
- [x] Next.js 16 app scaffold + court-fee / suit-type calculator page
- [x] `packages/domain`: court fee (Sch. I Art. 1), commercial/12A check, DRT fee, interest calculator, e-filing file names, case lifecycle — 28 unit tests
- [x] Supabase core schema migration: 23 tables, enums, RLS on every table, maker-checker trigger, append-only hash-chained audit log
- [x] RLS test suite on local Postgres (`pnpm test:db`)
- [x] Claude Code setup: CLAUDE.md, 8 agents, 9 skills, hooks (destructive-command guard, env/migration guard, PII scan, stop-on-red-tests, session-start status)
- [x] CI workflow (lint, typecheck, unit, DB/RLS tests, build)

## Done (demo platform)
- [x] Supabase Auth login (`/login`), session refresh in `src/proxy.ts`, role dashboard (`/dashboard`) filtered by RLS
- [x] `pnpm --filter web seed:demo` — synthetic org, 5 role users, 10 fake cases (amounts via domain functions)
- [x] Supabase demo project `Lawsuit` (Singapore) created; both migrations applied; security advisors addressed
- [x] Vercel public env vars set; demo data seeded (5 users, 10 cases); RLS verified per role on the live DB
- [ ] Owner: disable public sign-ups in Supabase Auth; change demo password after the client demo

## Next (Phase 0 → 1)
- [ ] NDA signed with client; receive 1 redacted sample file + format preferences
- [ ] Create a separate Supabase project `civil-suits-dev` (Mumbai, ap-south-1) in org "promenix-softech's Org" and apply the migration. **Blocked:** the free plan allows 2 active projects and both slots are taken (`niwaraa`, `promenix-softech's Project`). One must be paused/deleted, or the org upgraded to Pro.
- [x] Vercel project `civil-suits` (team "Manoj") created separately from `homigo` / `promenix-website`; root `apps/web`, framework Next.js, functions in bom1 (Mumbai). Env vars (Supabase URL/keys, API keys) to be set by the owner in Vercel → Settings → Environment Variables.
- [ ] Synthetic fixture generator: 10 fake cases → scanned-look 100-page PDF
- [ ] Auth (Supabase Auth + TOTP for admin/approver) and role dashboards
- [ ] Upload → storage → `documents`; worker skeleton (Docker: LibreOffice, OCRmyPDF, qpdf)
- [ ] Sarvam OCR + Haiku classification + Sonnet extraction behind one AI module with cost logging
- [ ] First templates (1 bank, EN + MR): demand notice, plaint, vakalatnama, affidavit/SOT, BBE 2026 certificate draft
- [ ] Time-and-motion study of 3–5 suits with client clerk

## Blocked / waiting on client
See `docs/open-questions.md`.

## Legal items pending verification ([[LEGAL_REVIEW]])
- BBE Act 2026 Second Schedule certificate wording (gazette text)
- Court-fee slabs below ₹1 lakh; cap (₹3L vs ₹10L)
- Advocates' Welfare Fund stamp amount (statute ₹20)
- Order XXXVII exact averment; Marathi legal terms marked †

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

## Done (Phase 1, slice 3)
- [x] Notice dispatch (mode, tracking no., date) → case `notice_sent`; plaint cites the dispatch date
- [x] Sec 12A stage: application (authority, date) → `mediation_12a`; outcome + mediator's report upload + report date (new column) → `drafting`; plaint cites the report; `needs12A` blocks skipping mediation
- [x] UI redesign: frosted-glass design system (`globals.css`), animated ambient backdrop, cursor-following light on cards, hover lift, shine on primary buttons, glass top bar, lifecycle stepper, status pills; light + dark; respects reduced motion. Screenshots in `docs/samples/ui-home-*.png`

## Done (Phase 1, slice 4)
- [x] Shared `caption()` (court, suit no., parties) used by plaint, vakalatnama, affidavit
- [x] Vakalatnama v1: welfare-fund + court-fee stamp boxes (amounts flagged), appointment, flagged powers clause, executant + acceptance blocks
- [x] Affidavit in support / statement of truth (commercial) v1: stamp-paper blank top, deponent, flagged prescribed declarations, jurat; stored as `statement_of_truth` for commercial suits
- [x] DOCX renderer: bordered stamp boxes, stamp-paper spacer; samples in `docs/samples/` (checked via LibreOffice PDF render)

## Done (Phase 1, slice 5 — OCR)
- [x] Sarvam Document Intelligence (digitise, `sarvamai` SDK 1.1.12): start job from a stored scan (EN/MR), poll status, fetch per-page Markdown; ≤10 pages per job
- [x] `ocr_jobs` table + RLS; `document_pages` insert/update for case editors; `usage_events` insert for case editors (₹0.50/page planning cost); RLS tests added; applied to demo DB
- [x] OCR text encrypted with AES-256-GCM (`lib/crypto.ts`, `FIELD_ENCRYPTION_KEY` in Vercel) and shown decrypted only on `/dashboard/cases/[id]/documents/[docId]`
- [x] Case advances `case_created → docs_uploaded` on upload and `→ extraction_review` after OCR
- [x] Web unit tests (vitest): encryption round-trip/tamper, result mapping, and SDK wiring against a local mock server
- Not verified live: api.sarvam.ai is unreachable from the build sandbox — first real run happens on the deployed site

## Done (Phase 1, slice 6 — field extraction)
- [x] Sarvam `extract` with a 14-field loan-file schema (`lib/extract/fields.ts`); values validated and normalised in code (dates day-first → ISO, amounts → paise, rate → bps, IFSC, account) — 34 tests
- [x] Extracted values stored encrypted (raw + normalised) with confidence and source document; re-extraction never overwrites human-verified values
- [x] Review UI on the case page: as-read text, confidence (amber < 85%, red if invalid), editable value, Verify; "Apply verified values to case" updates loan, borrower, guarantor and claim — commercial / 12A recomputed in code
- [x] Verified on the live DB (rolled back): the assigned drafter can verify and apply; another drafter can neither write nor see the fields
- Not verified live: the real Sarvam extract call (api.sarvam.ai unreachable from the sandbox)

## Done (Phase 1, slice 7 — admin)
- [x] Admin opens cases (`/dashboard/cases/new`): case no., branch, court, borrower, drafter + approver (≠), urgent-relief flag
- [x] Team card on the case page; admin re-assigns drafter/approver
- [x] Security fix: DB trigger `guard_case_assignment` — only admins can change assignment/org/creator (previously the assigned drafter could change their own approver via the drafter update policy). Tests added; verified on live DB
- [x] Audit log page (`/dashboard/audit`, admin): latest 100 entries, filter by entity, `verify_audit_chain()` recomputes the SHA-256 chain (tamper test added); live chain verified intact

## Done (slice 8 — document worker, 21 Oct)
- [x] `doc_jobs` queue (ADR 0002): users enqueue, only the worker (service role) claims/completes; one active job per case/version; RLS tests
- [x] `path_in_case()`: documents and draft versions can only point inside `{org}/{case}/` (worker reads with the service role); security review PASS after fixes
- [x] `apps/worker`: DOCX → PDF/A-2b (LibreOffice), annexure OCR (OCRmyPDF), e-filing bundle (index → plaint → exhibits A, B… → vakalatnama → SOT) merged by Ghostscript with bookmarks, A4/25 MB/encryption/PDF-A checks; converters get no secrets; Dockerfile; CI job with real converters
- [x] Case page: Make PDF/A, Prepare e-filing bundle, job status; sample bundle in `docs/samples/`
- [x] Synthetic scanned loan files (300 DPI, skew, noise) + expected-field manifest: `pnpm --filter @civil-suits/worker synthetic-scans`
- Applied to the live demo DB. Not running yet: needs a VPS for the worker

## Done (slice 9 — DRT)
- [x] `recoveryForum()`: civil < ₹3L ≤ commercial < ₹20L ≤ DRT (bank debts), DRT fee; plaint refused for ₹20L+ bank debts
- [x] DRT Original Application template (RDB Act s.19), DRT format profile (TNR 13, double, 5/2.5 cm); Maharashtra DRT benches list; sample DOCX
- [x] Demo case DEMO-2026-0010 (₹20.9L) moved to "Debts Recovery Tribunal, Pune (Demo)"
- Pending legal: OA form parts/verification, bench jurisdiction (open questions 10–11), e-DRT format

## Done (slice 10 — billing, export, ops) — local, tests green, NOT yet applied to the demo DB
- [x] Billing domain: GST split (CGST/SGST vs IGST), graduated slabs + monthly minimum, invoice number (≤16 chars, per FY), GSTIN checksum
- [x] `billing_plans`, `invoices` (immutable amounts, forward-only status), `billable_suit_packs()` (one per case, IST month; survives case deletion); usage rows for billing can no longer be forged by app users
- [x] Admin billing page, tax invoice DOCX (Rule 46 particulars), `create-invoice` script (service role)
- [x] Case export ZIP (admin only) via worker into private `case-exports` bucket, expired after 7 days
- [x] AI spend guard: `ai_quota_ok()` per user/hour and per office/day before every Sarvam call
- [x] Runbooks: `docs/runbooks/breach.md`, `retention-erasure.md`; `scripts/backup.sh` (encrypted pg_dump) + `scripts/restore-drill.sh` (verified locally, audit chain recomputed)
- Security review: blocking finding (billing loss on case delete) fixed with tests; migrations 20261021020000–040000 to apply

- Applied to the demo DB on 22 Oct (owner approved); the usage policy change was applied as `alter policy`

## Done (slice 11 — Phase 2 start)
- [x] Bulk upload (`/dashboard/batches`, admin): one PDF with many loan files → worker splits, OCRs locally (OCRmyPDF), classifies pages in code (sanction letter, agreement, statement, NPA notice, …) and groups them by loan account (OCR slips tolerated) → admin reviews and confirms → worker creates the cases and per-case scans. Account numbers are never stored (last 4 only); originals purged 7 days after closing. Security review PASS after fixes; applied to the demo DB
- [x] Field tasks: drafter/admin assign collect-docs / notary / e-filing / dispatch tasks; phone-first `/dashboard/tasks` with start, note and photo proof. **Security fix:** a field user could re-point their task to any case (and so see it); now only progress columns can change, closed tasks are frozen, office links are re-checked for admins too, and field staff see a case only while a task on it is open. Security review PASS (2nd round); applied to the demo DB
- [x] Interim application template (commercial + urgent relief), all grounds flagged `[[LEGAL_REVIEW]]`
- Claude Haiku page classification is not wired (no Anthropic key); the in-code classifier is the default and the review step catches mistakes

## Done (slice 12 — prompt-injection defense, 21 Oct)
- [x] Skill `prompt-injection-defense` (threat model, architecture rules, prompt/output patterns, agent rules, review checklist, attack corpus, portable guard code + hook); also added to Homigo (branch `claude/prompt-injection-defense`)
- [x] `packages/domain/promptGuard.ts`: `scanForInjection` (EN/MR/HI, obfuscation, base64, invisible chars), `stripInvisible`, `wrapUntrusted` (random boundary), `checkModelOutput` (URLs, markdown images, canary), `makeCanary` — 36 tests
- [x] Applied: extracted fields with instructions/links are never auto-accepted; bulk-intake pages flagged `injection` / `hidden_text` (new `batch_pages.flags`, applied to demo DB) with a warning in the review UI; OCR text view warns per page; injection fixture in the intake e2e test
- [x] Claude Code `PostToolUse` hook `injection-scan.sh`: warns the agent when tool output looks like an injection; CLAUDE.md rule "untrusted text is data"
- The source audio note was not transcribed (no speech model reachable from the sandbox); skill built from established practice — to be aligned with the note

## Done (slice 13 — security audit, 23 Oct) — applied to demo DB
- [x] No PHP anywhere (PHP2Shell CVE-2026-109618/109619 does not apply); prod deps `pnpm audit --prod` clean; React 19.3.1, docx 9.14.0
- [x] RLS + FORCE RLS on all 29 public tables (live check); service/secret keys absent from `apps/web/src` and Vercel; no secrets in git history
- [x] Security headers (CSP, HSTS, XFO, nosniff, Referrer/Permissions-Policy, COOP); explicit 1 MB caps for server actions and proxy bodies; proxy rejects Cookie > 16 KB with 431; proxy now covers all non-static routes
- [x] DB integrity (`20261023020000_approval_integrity`): re-pointing an approved draft resets it to draft; only the worker writes `pdf_path`; case status follows the lifecycle, `approved` only via an approval; mediation report must be an uploaded file in the case folder — 6 new RLS tests (108 ok)
- [x] `rls_auto_enable()` no longer executable by anon/authenticated; default privileges revoke function EXECUTE from anon
- [x] Worker: converters run in their own process group (whole group killed on timeout), `-dSAFER` explicit, ocrmypdf `--max-image-mpixels 150`
- [x] CI: `permissions: contents: read`; Dependabot (npm, actions, docker); `security.yml` (pnpm audit, gitleaks, no-PHP, client-secret grep, CodeQL on public repos)
- [ ] Owner: Supabase → Auth → enable leaked-password protection; confirm public sign-ups are off
- [ ] Worker sandbox before real data: run soffice/gs/ocrmypdf as a separate uid in bwrap/nsjail with no network and RLIMITs; per-bundle page budget (plan: 1,000) and per-job wall clock
- [ ] Upload names: store as `<ts>-<uuid>.<ext>` (original names can carry borrower names); atomic OCR start (partial unique index)

## Done (domain, 24 Oct)
- [x] Live at https://civilsuits.promenix.in (Hostinger CNAME → Vercel); production redirects every other host (old `civil-suits*.vercel.app` links) there with a 308 via `CANONICAL_HOST`; website APK opens the new address

## Removed (slice 14 — Promenix Tasks intern app, 24 Oct)
- Built by mistake (the owner wanted a Civil Suits field app); app and workflow deleted, tables dropped by `20261024030000_drop_intern_tasks`
- [ ] Apply the drop migration and delete the two `@tasks.promenix.test` demo users on the demo DB (needs owner confirmation in the Supabase connector); delete GitHub releases `tasks-android-1..3`

## Done (slice 15 — Civil Suits Field Android app, 24 Oct)
- [x] `apps/field-android`: field role only; own tasks (type, case no., court, branch, due, instructions); start / mark done with note + proof photo (shrunk, EXIF/GPS stripped, uploaded to `{org}/{case}/field/`); device-lock gate, auto-lock, FLAG_SECURE, Keystore-sealed session, HTTPS + system CAs only, no backups, root/debugger refusal, R8; animated UI; APK from `field-android.yml`
- [x] Task note / instructions: no PAN or 9+ digit numbers, now a DB constraint (`20261024020000_task_text_no_ids`) — 2 RLS tests (110 ok after the intern board was removed)
- [x] Demo field tasks: four kinds with due dates and instructions (synthetic); login `field@demo.civilsuits.test`
- [ ] Owner: `FIELD_KEYSTORE_*` secrets for a stable signing key

## Done (slice 16 — easier UI + letter margins, 25 Oct)
- [x] Letters not filed in court (demand notice, tax invoice) use a new `letter` layout: A4, 1" margins all round, TNR 12, 1.15 spacing. Court pleadings keep the e-filing margins (1.75" left / 1" right, owner confirmed); DRT keeps 5 / 2.5 cm
- [x] Command palette (Ctrl/⌘ K or "/"): jump to any visible case by case no. or borrower, plus main actions; cases read with the browser client so RLS decides what appears
- [x] Draft preview: "Preview" next to every DOCX version renders it as an A4 page in the browser (docx-preview 0.4.1) from the 5-minute signed URL; no download needed
- [x] "Needs attention" card on the dashboard: `caseDeadlines()` in `packages/domain` (10 tests) — limitation watch (3 yrs from NPA − 90 days, `[[LEGAL_REVIEW]]`: advocate confirms start date and s.18 extensions), 12A three-month period, notice period over, approval waiting > 2 days; plus own tasks overdue / due today
- [x] English ⇄ मराठी UI toggle (cookie `lang`): top bar, dashboard, status pills, stepper, case-page headings, palette, tasks heading; terms per `marathi-legal-glossary` (†-terms left in English). Forms and help text inside the case page are still English
- Security review: blocking finding fixed — a crafted DOCX could carry `javascript:` links into the preview (CSP allows inline script). Preview now renders off-document and strips handlers, non-`#` links, non-data/blob sources and active tags before attaching (checked in Chromium). `lang` cookie httpOnly; dashboard survives a bad date
- [ ] Follow-ups from review: narrow `draft_versions_path_check` to `{org}/{case}/drafts/…docx` (new migration); nonce-based `script-src` without `'unsafe-inline'`; palette search is capped at 1,000 cases
- Not verified live: no Supabase env in the sandbox, so palette / dashboard were checked by typecheck, lint and build only; preview checked in Chromium against the sample plaint

## Done (slice 17 — multi-office isolation, 25 Oct) — applied to the demo DB
- [x] Audit: all 29 tables carry `org_id` under RLS; security-definer functions, storage buckets and the worker's paths are office-scoped; one user = one office (`profiles.id`)
- [x] Gap closed: migration `20261025000000_tenant_same_org` — `same_org` triggers on 21 tables refuse any link (case → court/branch/user, child → case/document/draft, task → assignee, role → user …) to another office, including service-role writes
- [x] RLS tests: cross-office court / user / case links refused (also bypassing RLS), roles and tasks for another office's users refused, users cannot be pulled across, sweep over every org table shows no other-office rows; same-office links still work
- [x] `pnpm --filter web office` (service role, Promenix only): create office + invite admin, add users (refuses an email from another office), courts, bank branches; runbook `docs/runbooks/onboard-office.md`
- [x] Security review fixes (`20261025010000_tenant_org_fixed`): `org_id` can never change on any table (a case or user cannot be moved to another office, even by the service role); trigger fails closed on an unknown column; `documents.batch_id` checked; script never rewrites a profile's office, aborts on lookup errors and removes a half-created office. Tests added
- [x] Applied to the demo DB on 25 Oct (owner approved): 21 `same_org` + 28 `org_id_fixed` triggers live. `tenant_org_fixed` was applied with `create or replace trigger` instead of `drop trigger` + `create trigger` (same result; the Supabase connector's destructive-statement prompt timed out). Verified live in a rolled-back block: a case cannot change office, a same-office insert still works under hosted `postgres`
- [ ] Owner: keep Supabase public sign-ups off (users only by invitation)

## Done (slice 18 — India-wide start: state per court + second demo office, 25 Oct) — applied to the demo DB
- [x] `courts.state` (ISO 3166-2:IN, migration `20261025020000_court_state`; existing courts = MH). `courtFeeFor(state, claim)` in domain: Maharashtra computed; any other state returns no fee + `[[LEGAL_REVIEW]]` note instead of a guess. Plaint names the state's court-fee act, or flags it when unconfigured; case page shows "Not configured for <State>"
- [x] Second synthetic office **Demo Law Chambers, Bhopal (Synthetic)**: 4 users (`admin|drafter|approver|field@demo-mp.civilsuits.test`), SBI Bhopal / PNB Indore, courts Civil Judge Bhopal, Commercial Court Bhopal, DRT Jabalpur (all `MP`), 6 cases (₹1.86L–₹21.5L; amounts, forum and 12A computed by `scripts/demo-office-mp-sql.ts` with the domain functions), notice + pending 12A for the deadline card. Verified live: MP admin under RLS sees 1 office, 6 cases, 4 users, nothing of the Pune office; password login works
- Pending legal before real MP work: MP court-fee law and slabs, MP High Court e-filing format, Hindi templates, MP Advocates' Welfare Fund stamp, MP court naming (Civil Judge Class I/II), DRT Jabalpur jurisdiction
- [ ] Owner: change the MP demo password after the demo

## Next (Phase 1)
- [ ] Owner: VPS for the worker (Docker), service-role key there only; run converters without network before real data
- [ ] TOTP MFA for admin and approver (plan C4) — on hold at owner's request
- [ ] Demand notice in Marathi (needs † glossary terms confirmed)
- [ ] BBE 2026 certificate (needs gazette text)
- [ ] Worker (Docker on VPS): DOCX→PDF/A, OCRmyPDF; needs a VPS
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

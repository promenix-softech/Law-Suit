# Handoff — work in flight

Read by the `task-resumer` agent (and by any new session) to carry on after a usage limit, a
restart or a full context. Keep it short: one entry per task, rewritten as the work moves.
Finished history lives in `docs/STATUS.md`, not here.

Branch: `claude/exciting-davinci-7jz0dr` (base `ccr-9485de6a-xyehf1`). Demo database:
Supabase project `ohdtudvmcahdnqnhfqzp`.

## Pending

All on the work branch; nothing merged, no migration applied to the demo database.

**A. Review follow-ups (15 Nov) — written and tested, waiting for the security review.**
Atomic OCR start (`20261115000000_ocr_start_atomic`), draft path check
(`20261115010000_draft_path_narrow`), palette search beyond 1,000 cases, nonce-based CSP. Details
in `docs/STATUS.md` "Review follow-ups (15 Nov)". Left to do:
1. `security-reviewer` on `origin/ccr-9485de6a-xyehf1..6e1130a` — started twice, cut off by the
   usage limit both times; run it again and fix what it finds.
2. Small fix after the review: in `refreshOcr` close the job with `.eq("status", "running")` and
   log usage only if that update changed the row (two tabs polling can record usage twice).

**B. Owner's request of 15 Nov (in his words: more controls for the super admin, scheme with
yearly and monthly usage; approval requests in a window of their own).**
1. Approvals page — done: `/dashboard/approvals` (`lib/approvals-inbox.ts` + tests,
   `lib/approvals-data.ts`, `approvals/page.tsx`, `approvals/inbox-controls.tsx`), nav link with a
   badge, dashboard card links to it, Marathi words, e2e in `roles.spec.ts` (16/16 on a fresh
   stack). Left: look at screenshots (desktop, phone, Marathi) and adjust.
2. Super admin, database — next. Plan: `platform_admins` (who is a super admin; written only by
   the service role) + `is_platform_admin()`; `office_schemes` (monthly / yearly scheme, cases
   allowed per month and per year, valid from–to, what happens at the limit: warn or block new
   cases, AI job caps, seats); `organizations.suspended_at` with one enforcement point; functions
   for the super admin that return counts only (never case data): offices with scheme and usage,
   monthly usage for 12 months; functions to set a scheme, suspend / resume, create an office.
   RLS tests.
3. Super admin, pages — after that: `/dashboard/platform` (offices, scheme, usage this month and
   this year against the allowance) and an office page (scheme form, 12-month usage, controls);
   the office admin's Billing page shows its own scheme and usage. Marathi words, e2e.
4. Then: `pnpm check`, db tests, e2e, `security-reviewer`, STATUS. Ask the owner: which login is
   the super admin on the live site, applying the migrations, PR, merge.

## Needs the owner
- Try "New case → From the bank's file" once with a synthetic loan file: the first run against
  the real Sarvam API (the tests used a stand-in).
- Type a Marathi name and address on a demo case (Suit particulars → "मराठी नाव व पत्ता") and
  generate the Marathi notice once, to see it printed.
- Marathi notice wording to the advocate; then drop the review line (new template version).

## Owner's own list before launch (do not raise again — owner, 13 Nov)
- Delete the Satyam demo office and its Vercel domain; move the database to a Mumbai Pro project;
  the demo password stays as it is until then. Everything on the site is demo data.

## Done
- #33 merged (hearings, limitation events, report, Marathi notice v2, simple view, help page);
  migrations `20261109000000`, `20261109010000`, `20261111000000` are on the demo database.
- #34 merged (Marathi name / address of a party, `task-resumer`, this file); migration
  `20261112000000` is on the demo database.
- #35 merged (no file names in storage, `cleanText`, phone fixes, e2e per role with CI job
  `e2e` on a local Supabase stack — 8/8 green in CI). No database step.
- #37 merged (open a new case from the bank's file; court by law, Pune by default); migrations
  `20261114000000`, `…010000`, `…020000` on the demo database; checked live (both ways, Pune default).
- #38 merged (Marathi labels for the new-case page). No database step; checked live in Marathi.

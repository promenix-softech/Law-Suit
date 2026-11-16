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
1. `security-reviewer` — started twice, cut off by the usage limit both times. Run ONE review at
   the end over the whole branch (`origin/ccr-9485de6a-xyehf1..HEAD`) and fix what it finds.
2. Small fix: in `refreshOcr` close the job with `.eq("status", "running")` and log usage only if
   that update changed the row (two tabs polling can record usage twice).

**B. Owner's request of 15 Nov (more controls for the super admin, scheme with yearly and monthly
usage; approval requests in a window of their own).**
1. Approvals page — done and committed: `/dashboard/approvals`, e2e in `roles.spec.ts`,
   screenshots sent to the owner.
2. Super admin, database — done and committed: migration `20261116000000_platform_admin`
   (`platform_admins`, `office_schemes`, `office_scheme_state()`, `office_usage_monthly()`,
   `platform_set_scheme()`, `platform_set_suspended()`, pausing through `current_org_id()` /
   `has_role()`, scheme limits on new cases / seats / AI readings), RLS tests.
3. Super admin, pages — written and committed, typecheck and lint clean, NOT yet tried in a
   browser: `packages/domain/src/scheme.ts` (+tests), `lib/platform.ts`,
   `components/scheme-usage.tsx`, `dashboard/platform/page.tsx`, `dashboard/platform/[orgId]/…`,
   `dashboard/platform/actions.ts`, shell (`dashboard/layout.tsx`: paused notice, "Offices" link),
   Billing page scheme card, `lib/new-case.ts` `schemeRefusal`. Left to do, in order:
   a. Marathi words for the new strings (`scratchpad/add_i18n.py <json> <comment>`; if the
      scratchpad is gone, add the keys to `apps/web/src/lib/i18n.ts` by hand).
   b. Seed: a platform office (firm code `promenix`) with a demo super admin in
      `apps/web/scripts/seed-demo.ts` (local / e2e only), service-role insert into
      `platform_admins`.
   c. e2e (`apps/web/e2e/platform.spec.ts`): super admin sees the offices, sets a blocking scheme
      → the office admin is refused a new case with the reason → warn → allowed; pause → the
      office's people see the notice → resume; an office admin gets 404 on `/dashboard/platform`.
   d. Screenshots (desktop, Marathi) to the owner.
4. Then: `pnpm check`, db tests, e2e, `security-reviewer`, STATUS. Ask the owner: which login is
   the super admin on the live site, applying the three migrations, PR, merge.
   Not built (say so): creating a new office and inviting its first admin from the super admin's
   page (needs a change to the `invite-user` edge function), invoices from the page.

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

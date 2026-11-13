# Handoff — work in flight

Read by the `task-resumer` agent (and by any new session) to carry on after a usage limit, a
restart or a full context. Keep it short: one entry per task, rewritten as the work moves.
Finished history lives in `docs/STATUS.md`, not here.

Branch: `claude/exciting-davinci-7jz0dr` (base `ccr-9485de6a-xyehf1`). Demo database:
Supabase project `ohdtudvmcahdnqnhfqzp`.

## Pending

### 1. Open a case from the bank's file — in progress (owner's ask, 13 Nov)
Owner: "click → upload the bank document → AI fills everything → only review → case opens;
editable; where to file decided by law; Pune court by default, other districts selectable; keep
it very easy to use."
- Done and pushed: `chooseCourt` + 36 districts (packages/domain, tests); migrations
  `20261114000000_case_intake` (bucket `case-intake`, table `case_intakes`, quota) and
  `20261114010000_case_intake_discard` with RLS tests; server actions
  `apps/web/src/app/dashboard/cases/new/intake-actions.ts`; `lib/extract/intake.ts` (tests);
  case creation shared in `lib/new-case.ts`.
- UI done and pushed (`new-case-chooser.tsx`, `intake-flow.tsx`, `court-picker.tsx`); e2e with a
  Sarvam stand-in, 10/10 from a fresh stack; `pnpm check` passes; STATUS updated.
- Security review FAIL → fixed (commit 48b745c, migration `20261114020000_case_intake_claim`);
  re-review running. Then the owner: apply the three migrations to the demo DB **before** the
  merge, PR, merge.

## Needs the owner
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

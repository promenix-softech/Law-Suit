# Handoff — work in flight

Read by the `task-resumer` agent (and by any new session) to carry on after a usage limit, a
restart or a full context. Keep it short: one entry per task, rewritten as the work moves.
Finished history lives in `docs/STATUS.md`, not here.

Branch: `claude/exciting-davinci-7jz0dr` (base `ccr-9485de6a-xyehf1`). Demo database:
Supabase project `ohdtudvmcahdnqnhfqzp`.

## Pending

### 1. Safer uploads, typed text, phone case list — done on the branch (13 Nov)
- Committed and pushed; security review PASS; `pnpm check` passes. No migration.
- Left: the owner decides on a pull request and merge (code only, no database step).

### 2. Next without the owner (agreed 13 Nov)
- Phone tap targets and the approver's queue by case: done (same branch).
- e2e per role in CI (needs a local Supabase stack in the runner).

## Needs the owner
- Delete the Satyam demo office: SQL was given in chat (Supabase SQL Editor); remove
  `satyam.civilsuits.promenix.in` in Vercel.
- Type a Marathi name and address on a demo case (Suit particulars → "मराठी नाव व पत्ता") and
  generate the Marathi notice once, to see it printed.
- Marathi notice wording to the advocate; then drop the review line (new template version).
- Hearing / limitation buttons were not clicked on the live site yet (rules are covered by the
  RLS tests): add one hearing date on a filed demo case to confirm.
- Before real data: Pro plan in Mumbai with backups, demo passwords, MFA, error tracking
  (see "Before real client data" in `docs/STATUS.md`).

## Done
- #33 merged (hearings, limitation events, report, Marathi notice v2, simple view, help page);
  migrations `20261109000000`, `20261109010000`, `20261111000000` are on the demo database.
- #34 merged (Marathi name / address of a party, `task-resumer`, this file); migration
  `20261112000000` is on the demo database.

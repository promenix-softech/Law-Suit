# Handoff — work in flight

Read by the `task-resumer` agent (and by any new session) to carry on after a usage limit, a
restart or a full context. Keep it short: one entry per task, rewritten as the work moves.
Finished history lives in `docs/STATUS.md`, not here.

Branch: `claude/exciting-davinci-7jz0dr` (base `ccr-9485de6a-xyehf1`). Demo database:
Supabase project `ohdtudvmcahdnqnhfqzp`.

## Pending

### 1. Branch ready for a pull request (13 Nov) — waiting on the owner
- Safer uploads + typed text (security review PASS), phone fixes, e2e tests per role with a CI
  job on a local Supabase stack (8/8 pass locally from a fresh stack; security review PASS). `pnpm check` passes. No migration, no
  database step: a merge only redeploys the site.
- Left: the owner says whether to open the pull request and merge. Then watch the new `e2e`
  CI job's first run (it pulls the Supabase images in the runner).

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

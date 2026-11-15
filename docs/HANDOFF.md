# Handoff — work in flight

Read by the `task-resumer` agent (and by any new session) to carry on after a usage limit, a
restart or a full context. Keep it short: one entry per task, rewritten as the work moves.
Finished history lives in `docs/STATUS.md`, not here.

Branch: `claude/exciting-davinci-7jz0dr` (base `ccr-9485de6a-xyehf1`). Demo database:
Supabase project `ohdtudvmcahdnqnhfqzp`.

## Pending

Review follow-ups that need no owner decision (started 15 Nov, on the work branch, not merged):
1. Atomic OCR start — done: migration `20261115000000_ocr_start_atomic` (claim row `starting`,
   one active job per scan and pipeline, job facts fixed), `ocr-actions.ts` `startJob`, RLS tests.
2. Narrow `draft_versions_path_check` — done: migration `20261115010000_draft_path_narrow`, RLS tests; the demo database has no row outside `drafts/` (checked read-only).
3. Palette search beyond 1,000 cases — written (`lib/palette-search.ts`, unit tests); the database queries still to be tried against the local stack.
4. Nonce-based CSP — in progress; read `apps/web/AGENTS.md` and the Next docs first, verify with e2e.
5. Then: `pnpm check`, db tests, e2e, `security-reviewer`, STATUS; ask the owner before applying
   the migrations to the demo database, opening the PR and merging.

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

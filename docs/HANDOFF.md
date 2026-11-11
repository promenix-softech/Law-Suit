# Handoff — work in flight

Read by the `task-resumer` agent (and by any new session) to carry on after a usage limit, a
restart or a full context. Keep it short: one entry per task, rewritten as the work moves.
Finished history lives in `docs/STATUS.md`, not here.

Branch: `claude/exciting-davinci-7jz0dr` (base `ccr-9485de6a-xyehf1`). Demo database:
Supabase project `ohdtudvmcahdnqnhfqzp`.

## Pending

### 1. Marathi names and addresses for the Marathi demand notice — in progress
Owner's ask (11 Nov): the notice must print borrower / guarantor names and addresses in Marathi;
a person types them, code never transliterates.
- Plan: `parties.name_mr`, `parties.address_mr`, `parties.through_name_mr` (migration, length
  checks, RLS test that an editor can set them); inputs in the Suit particulars form;
  `Defendant.nameMr / addressMr / through.nameMr` in `packages/templates`; `demandNoticeMr.ts`
  prints the Marathi value when present, else the bank-record value; golden + unit tests.
- Stopped at: branch restarted from the merged base; nothing written yet.

## Needs the owner
- Delete the Satyam demo office: SQL was given in chat (Supabase SQL Editor); remove
  `satyam.civilsuits.promenix.in` in Vercel.
- Marathi notice wording to the advocate; then drop the review line (new template version).
- Hearing / limitation buttons were not clicked on the live site yet (rules are covered by the
  RLS tests): add one hearing date on a filed demo case to confirm.
- Before real data: Pro plan in Mumbai with backups, demo passwords, MFA, error tracking
  (see "Before real client data" in `docs/STATUS.md`).

## Done
- #33 merged (hearings, limitation events, report, Marathi notice v2, simple view, help page);
  migrations `20261109000000`, `20261109010000`, `20261111000000` are on the demo database.

# Runbook — retention, erasure and exit

The advocate office (Data Fiduciary) decides how long case data is kept; Promenix (Data Processor) carries it out. Processing to enforce a legal claim is largely exempt from consent duties (DPDP Act s.17(1)(a)), but security safeguards and contractual deletion still apply. Confirm periods with the office and the bank's empanelment terms.

## Default retention (to be confirmed by the office)

| Data | Proposed default | Why |
|---|---|---|
| Case record, drafts, filed bundle | Until the suit is disposed + limitation for appeal/execution, then per bank instruction | Needed to conduct and execute the suit |
| Scans and OCR text | Same as the case | Evidence |
| Audit log | Never edited; kept as long as the org exists | Tamper-evidence |
| Usage events, invoices | 8 years | Tax records |
| Exports (ZIP) | 30 days | Short-lived copies |

## Erasure request (borrower or bank)
1. The office logs the request (who, which case, date) and decides. Many requests can be refused while the suit is live (legal claim); record the reason.
2. If erasure is approved, an admin exports the case first if the office wants an archive (`Export case (ZIP)` on the case page).
3. Promenix deletes, with the service key, in this order: storage objects under `{org_id}/{case_id}/` in `case-files` and `case-exports`, then the case row (cascades to parties, loans, documents, pages, extracted fields, drafts, jobs).
4. `audit_log` rows stay: they hold hashes and ids only, no document text.
5. Send the office a deletion confirmation (case number, date, what was deleted).

## End of contract (exit)
1. Office admins export every case (ZIP per case), or Promenix runs a full export with the service key.
2. After the office confirms receipt, Promenix deletes the org's storage objects and rows, then the Supabase backups age out (Pro: 7-day PITR/daily backups).
3. Promenix issues a deletion certificate: org, date, data categories, backup expiry date.

## Never
- Never copy production data to a laptop, a test project or a prompt.
- Never restore a backup into a shared or less-protected project; drills use a throwaway database (`backup-restore.md`).

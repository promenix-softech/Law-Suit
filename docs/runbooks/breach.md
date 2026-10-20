# Runbook — personal data breach

**Roles.** The advocate office (and the bank upstream) is the Data Fiduciary. Promenix is the Data Processor. Under the NDA, Promenix notifies the office **within 24 hours** of becoming aware of a breach, so the office can meet its own deadlines.

**Deadlines that may apply** (confirm each with counsel at the time):

| Who | To whom | When | Source |
|---|---|---|---|
| Promenix | Client (advocate office) | ≤ 24 h | NDA / processing contract |
| Data Fiduciary | Data Protection Board | Without delay; detailed report ≤ 72 h | DPDP Rules 2025, Rule 7 (in force 13 May 2027) |
| Data Fiduciary | Affected people | Without delay | DPDP Rules 2025, Rule 7 |
| Service provider / body corporate | CERT-In | ≤ 6 h for reportable cyber incidents | CERT-In Directions, 28 Apr 2022 (check applicability) |
| Office → bank | Bank | As set in the empanelment letter | Empanelment terms |

## 0–1 hour: contain
1. Name an incident lead (Promenix) and a client contact. Open a private incident log with times (IST).
2. Stop the leak:
   - Leaked key: rotate at once. Supabase secret/service key in the Supabase dashboard; `FIELD_ENCRYPTION_KEY` (see "Key rotation"); `SARVAM_API_KEY` in the Sarvam console. Update Vercel and worker env; redeploy.
   - Compromised user: Supabase Auth → user → sign out all sessions; remove their `user_roles` row.
   - Compromised worker host: stop the container, revoke the service key, keep the disk for forensics.
3. Keep evidence: do **not** delete logs, storage objects or audit rows. Export `audit_log` for the window (`/dashboard/audit`; `verify_audit_chain()` must show the chain intact).

## 1–6 hours: assess
4. What leaked? Use `audit_log` (entity, actor, time), storage access logs (Supabase → Logs → Storage), Vercel runtime logs and worker logs (job ids only).
5. Classify data: names/addresses (plaintext), encrypted fields (`*_enc`, only exposed if the key also leaked), scans, OCR text.
6. Count affected people and cases per bank. Decide if CERT-In reporting applies.

## Within 24 hours: notify the client
7. Send the client: what happened, when it was found, data categories, approximate number of people and cases, containment done, next steps, contact person. No borrower PII in the email body. Share details through the app or an encrypted attachment.

## Within 72 hours: support the client's report
8. Give the client what the Board report needs: facts, timeline, cause, measures taken, measures to prevent recurrence, and the processor's findings.
9. Help the client notify affected borrowers and guarantors if they decide to (plain language, what to watch for, contact).

## After
10. Root cause, fix, regression test (RLS test or worker test), and an ADR if the design changes.
11. Restore drill if data integrity was in doubt (`docs/runbooks/backup-restore.md`).
12. Update this runbook.

## Key rotation (`FIELD_ENCRYPTION_KEY`)
Encrypted values carry a version byte. Rotation: add the new key as the current version, keep the old key for decryption only, re-encrypt rows in a batch job, then remove the old key. Until that job exists (`[[TODO]]`, see STATUS), a rotation needs a planned re-encryption window.

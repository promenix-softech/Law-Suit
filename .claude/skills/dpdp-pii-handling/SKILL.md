---
name: dpdp-pii-handling
description: PII inventory and handling rules under the DPDP Act 2023 / Rules 2025 — Aadhaar masking, pseudonymisation before LLM calls, retention, erasure, breach runbook. Use whenever code reads, stores, logs, exports or sends personal data.
---
# DPDP & PII handling

Roles: the advocate office (and upstream bank) = Data Fiduciary; Promenix = Data Processor under contract.
Key dates: substantive duties (Rule 6 safeguards, Rule 7 breach reporting) from **13 May 2027**.

## PII inventory
| Data | Storage |
|---|---|
| Borrower/guarantor name, address | plaintext (needed in drafts), RLS-protected |
| PAN, account no., DOB, phone | `*_enc` AES-256-GCM |
| Aadhaar | last 4 only; mask in generated bundles unless court requires |
| OCR text of scans | `ocr_text_enc` |
| Scans | private bucket |

## Rules
- Pseudonymise before Claude: replace names/PAN/account/Aadhaar with `{{BORROWER_1}}`, `{{ACCOUNT_1}}`…; keep the map server-side only.
- No PII in logs, URLs, error messages, analytics, WhatsApp/SMS/email bodies — send a link to the app.
- Log PII views/downloads/exports in `audit_log`.
- Retention: configurable per org; erasure requests via `data_requests`; deletion certificate on contract end.
- Breach: notify client within 24 h (so they can meet the 72 h Board report); runbook in `docs/runbooks/breach.md` (Phase 3).
- Tests/fixtures: synthetic only; PANs start with `FAKE`; the `pii-scan` hook blocks real-looking values.

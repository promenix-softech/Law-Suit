---
name: ocr-extraction-pipeline
description: Scan intake pipeline — page split, Sarvam/Google OCR, Haiku page classification, case clustering, Sonnet JSON extraction with confidence and source page, human verification. Use when working on upload, OCR, classification or extraction code.
---
# OCR & extraction pipeline

1. Upload → private bucket → `documents` row (sha256) → enqueue `ingest` (pgmq).
2. Worker splits to pages → **Sarvam Document Digitization** (≤10 pages/job, ≤10 req/min, exponential retry) → fallback **Google Document AI** on failure. Store `ocr_text_enc`.
3. **Classify** each page with Claude Haiku 5.5: `sanction_letter | account_statement | kyc | guarantor | interest_certificate | demand_notice | loan_application | other` + `case_key` (account no. last digits / borrower name / branch).
4. **Cluster** pages into cases by `case_key` → UI asks a human to confirm the split.
5. **Extract** per case with Claude Sonnet 5.5 using a JSON schema (zod-validated). Each field: `{value, confidence, source_page_no}`.
6. **Validate in code**: dates parse, IFSC regex, amounts as paise, account format. Fields with confidence < 0.85 or failing validation are flagged for the drafter.
7. Drafter verifies → `extracted_fields.verified_by/at`.

Rules: pseudonymise OCR text before Claude where the field isn't needed; never ask the LLM to compute totals/interest/fees; log every call (pages, tokens, cost paise) to `usage_events`; target ≤ ₹50 AI cost per case.

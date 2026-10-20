# ADR 0002 — Document worker queue and e-filing bundle

**Status:** Accepted (2026-10-21)

## Context
DOCX → PDF/A conversion, scan OCR and the e-filing bundle need LibreOffice, Ghostscript, qpdf and OCRmyPDF, and can take minutes. ADR 0001 put them on a VPS worker fed by pgmq. pgmq is not available in the plain Postgres used for `pnpm test:db`, so its RLS and privileges could not be tested there.

## Decision
- Queue = table `doc_jobs` (`kind`: `draft_pdf` | `efiling_bundle`) claimed with `FOR UPDATE SKIP LOCKED` in `claim_doc_job()`. Stale running jobs are re-claimed after 15 min, at most 3 attempts.
- Users only **insert** (RLS: case editors, status `queued`). A security-definer trigger checks the payload belongs to the case (draft version, annexure documents) and that a bundle is only queued for an approved case. There are no update/delete policies.
- Only the worker (`service_role`, key on the VPS only) may call `claim_doc_job`, `complete_doc_job`, `fail_doc_job`. `complete_doc_job` refuses output paths outside `{org_id}/{case_id}/`.
- Bundle = index (generated from `buildBundleIndex`, page numbers settled in ≤ 3 passes) → plaint → annexures (OCRmyPDF, exhibit marks A, B, …) → vakalatnama → affidavit / SOT; only **approved** drafts. Ghostscript merges to PDF/A-2b with one bookmark per document, fits every page to A4, then the worker checks PDF/A marker, encryption, page size and the 25 MB limit before upload.
- Scans and drafts live only in a per-job temp dir that is deleted afterwards; logs carry job ids, never names or text.
- **Paths:** the service role bypasses storage RLS, so `documents.storage_path` and `draft_versions.docx_path/pdf_path` must satisfy `path_in_case()` (`{org_id}/{case_id}/…`, no `.`/`..`/empty segments), enforced by triggers; the job trigger and `complete_doc_job` re-check it, and the worker checks every download/upload again (`caseStore`).
- **Converters** run with a minimal environment (no service key), inputs capped at 40 MB and 300 pages per annexure; only worker-authored messages reach `doc_jobs.error`.
- **Before real data:** run converters as a separate unprivileged user/container with no outbound network (LibreOffice may fetch linked resources; Ghostscript/LibreOffice parse untrusted files).

## Consequences
- Same queue semantics locally and on Supabase; tested in `supabase/tests/rls_test.sql` and `apps/worker/src/*.test.ts` (real converters, skipped where not installed).
- If job volume grows, pgmq or a dedicated queue can replace the table behind the same three functions.
- veraPDF is not yet in the pipeline; the PDF/A check is the XMP marker plus Ghostscript's PDF/A mode.

## Alternatives considered
- pgmq — untestable in CI Postgres today; no benefit at current volume.
- Converting on Vercel — no native tools, function time limits.

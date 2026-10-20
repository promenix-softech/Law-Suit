import "server-only";
import { SarvamAIClient } from "sarvamai";

/**
 * Sarvam Document Intelligence (digitise pipeline). Jobs run asynchronously:
 * start → poll status → fetch per-page Markdown once terminal.
 * Limits per Sarvam docs: ≤ 10 pages per job, ≤ 200 MB per file.
 */
export const OCR_LANGUAGES = { "en-IN": "English", "mr-IN": "Marathi" } as const;
export type OcrLanguage = keyof typeof OCR_LANGUAGES;

export const TERMINAL = ["completed", "partially_completed", "failed", "rejected"] as const;
export type OcrStatus = "running" | (typeof TERMINAL)[number];

/** Planning figure from docs/plan.md (₹0.50/page); used for usage_events until billing reconciles. */
export const COST_PAISE_PER_PAGE = 50;

function client(): SarvamAIClient {
  const apiSubscriptionKey = process.env.SARVAM_API_KEY;
  if (!apiSubscriptionKey) throw new Error("SARVAM_API_KEY is not set");
  // SARVAM_BASE_URL is only for tests against a local mock; production uses the SDK default.
  return new SarvamAIClient({ apiSubscriptionKey, ...(process.env.SARVAM_BASE_URL ? { baseUrl: process.env.SARVAM_BASE_URL } : {}) });
}

export async function startDigitise(file: { data: Blob; filename: string; contentType: string }, language: OcrLanguage) {
  const res = await client().docAi.digitise({
    file: [{ data: file.data, filename: file.filename, contentType: file.contentType }],
    language,
    content_type: "printed",
  });
  return { jobId: res.job_id, status: normaliseStatus(res.status) };
}

/** Extract pipeline: Sarvam reads the document and fills `schema`, with per-field confidence. */
export async function startExtract(file: { data: Blob; filename: string; contentType: string }, schema: string) {
  const res = await client().docAi.extract({
    file: [{ data: file.data, filename: file.filename, contentType: file.contentType }],
    schema,
    output_format: "json",
  });
  return { jobId: res.job_id, status: normaliseStatus(res.status) };
}

export async function jobExtraction(jobId: string): Promise<{ result: Record<string, unknown>; annotations: Record<string, unknown> }> {
  const res = (await client().docAi.getResults(jobId, { format: "json" })) as unknown as {
    result?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
  };
  return { result: res.result ?? {}, annotations: res.annotations ?? {} };
}

/** Planning figure from docs/plan.md (₹1/page for extraction). */
export const EXTRACT_COST_PAISE_PER_PAGE = 100;

export async function jobStatus(jobId: string) {
  const res = await client().docAi.getStatus(jobId);
  return {
    status: normaliseStatus(res.status),
    pagesTotal: res.usage?.pages_total ?? null,
    pagesSucceeded: res.usage?.pages_succeeded ?? null,
  };
}

export async function jobPages(jobId: string) {
  const res = await client().docAi.getResults(jobId, { format: "md" });
  return pagesFromResults(res);
}

export function normaliseStatus(s: string): OcrStatus {
  const v = s.toLowerCase();
  return (TERMINAL as readonly string[]).includes(v) ? (v as OcrStatus) : "running";
}

/**
 * Per-page text from digitise results. We submit one file per job, so the first document's
 * page numbers are used; missing numbers fall back to position.
 */
export function pagesFromResults(results: unknown): { pageNo: number; text: string }[] {
  const docs = (results as { documents?: { pages?: { page_number?: number; content?: string }[] }[] })?.documents ?? [];
  const pages = (docs[0]?.pages ?? []).map((p, i) => ({ pageNo: p.page_number ?? i + 1, text: (p.content ?? "").trim() }));
  return pages.sort((a, b) => a.pageNo - b.pageNo);
}

/** Turns SDK/HTTP errors into a message safe to show the user (no keys, no payloads). */
export function ocrErrorMessage(e: unknown): string {
  const status = (e as { statusCode?: number })?.statusCode;
  if (status === 400 || status === 422) return "Sarvam rejected the file — scans must be PDF/JPG/PNG with at most 10 pages.";
  if (status === 401 || status === 403) return "Sarvam API key is missing or invalid.";
  if (status === 402) return "Sarvam account has insufficient credits.";
  if (status === 413) return "File is too large for OCR.";
  if (status === 429) return "Sarvam rate limit reached — try again in a minute.";
  return "OCR service is unavailable right now. Try again shortly.";
}

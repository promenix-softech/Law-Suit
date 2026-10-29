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

/**
 * JSON, not Markdown: the live API answers 400 "job produced html, cannot serve md" for
 * digitise jobs, while JSON carries every page as layout blocks.
 */
export async function jobPages(jobId: string) {
  const res = await client().docAi.getResults(jobId, { format: "json" });
  return pagesFromResults(res);
}

export function normaliseStatus(s: string): OcrStatus {
  const v = s.toLowerCase();
  return (TERMINAL as readonly string[]).includes(v) ? (v as OcrStatus) : "running";
}

type ResultPage = {
  page_number?: number;
  page_num?: number;
  content?: string;
  blocks?: { text?: string; reading_order?: number; layout_tag?: string }[];
};

/**
 * Per-page text from digitise results. We submit one file per job, so the first document's
 * pages are used; missing numbers fall back to position. The JSON format gives layout blocks
 * (`page_num`, `blocks[].text` in `reading_order`); older responses give `content` directly.
 */
export function pagesFromResults(results: unknown): { pageNo: number; text: string }[] {
  const docs = (results as { documents?: { pages?: ResultPage[] }[] })?.documents ?? [];
  const pages = (docs[0]?.pages ?? []).map((p, i) => ({
    pageNo: p.page_number ?? p.page_num ?? i + 1,
    text: (p.content ?? blocksText(p.blocks)).trim(),
  }));
  return pages.sort((a, b) => a.pageNo - b.pageNo);
}

/**
 * Image blocks (stamps, logos, photos) carry a model-written description of the picture, not
 * text printed on the page, so only a marker is kept.
 */
function blocksText(blocks: ResultPage["blocks"]): string {
  return [...(blocks ?? [])]
    .sort((a, b) => (a.reading_order ?? 0) - (b.reading_order ?? 0))
    .map((b) => (b.layout_tag === "image" ? "[image]" : htmlToText(b.text ?? "").trim()))
    .filter(Boolean)
    .join("\n\n");
}

const ENTITIES: Record<string, string> = { quot: '"', "#39": "'", nbsp: " " };

/**
 * Table blocks arrive as HTML (`<table><tr><td>…`). Rows become lines and cells are joined
 * with " | ", so the OCR text view and anything reading it see plain text, never markup.
 * Angle brackets left by nested or broken tags are dropped, `&lt;`/`&gt;` are not decoded,
 * and `&amp;` is decoded last, so no tag can be rebuilt from the output.
 */
export function htmlToText(s: string): string {
  if (!s.includes("<")) return s;
  return s
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, " | ")
    .replace(/<\/tr>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/&(quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e]!)
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
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

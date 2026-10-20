"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canTransition, type CaseStatus } from "@civil-suits/domain";
import { encryptText } from "@/lib/crypto";
import { confidenceOf, extractionSchema, FIELDS, normalise } from "@/lib/extract/fields";
import {
  COST_PAISE_PER_PAGE,
  EXTRACT_COST_PAISE_PER_PAGE,
  OCR_LANGUAGES,
  jobExtraction,
  jobPages,
  jobStatus,
  ocrErrorMessage,
  startDigitise,
  startExtract,
  type OcrLanguage,
} from "@/lib/ocr/sarvam";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Scan = { doc: { id: string; org_id: string; case_id: string }; file: { data: Blob; filename: string; contentType: string } };

/**
 * Loads a stored scan for an AI job, after checking the caller may edit the case (so no
 * credits are spent on a request RLS would reject) and that no job is already running.
 */
async function loadScan(supabase: Supabase, documentId: string, pipeline: "digitise" | "extract"): Promise<Scan | string> {
  const { data: doc } = await supabase.from("documents").select("id, org_id, case_id, storage_path").eq("id", documentId).single();
  if (!doc?.case_id) return "Document not found.";

  const { data: allowed } = await supabase.rpc("can_edit_case", { c_id: doc.case_id });
  if (!allowed) return "You cannot process documents for this case.";

  const { count } = await supabase
    .from("ocr_jobs")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("pipeline", pipeline)
    .eq("status", "running");
  if (count) return "A job is already running for this document.";

  const ext = doc.storage_path.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME[ext];
  if (!contentType) return "Only PDF, JPG or PNG scans can be processed.";

  const { data: blob, error } = await supabase.storage.from("case-files").download(doc.storage_path);
  if (error || !blob) return "Could not read the scan from storage.";
  return { doc: { id: doc.id, org_id: doc.org_id, case_id: doc.case_id }, file: { data: blob, filename: `scan.${ext}`, contentType } };
}

async function recordJob(supabase: Supabase, scan: Scan, pipeline: "digitise" | "extract", jobId: string, status: string, language: string) {
  const { error } = await supabase.from("ocr_jobs").insert({
    org_id: scan.doc.org_id,
    document_id: scan.doc.id,
    pipeline,
    provider_job_id: jobId,
    language,
    status,
  });
  return error ? "Could not record the job." : null;
}

const StartInput = z.object({
  documentId: z.uuid(),
  language: z.enum(Object.keys(OCR_LANGUAGES) as [OcrLanguage, ...OcrLanguage[]]),
});

/** OCR: sends a scan to Sarvam (digitise) and records the job. */
export async function startOcr(input: z.infer<typeof StartInput>): Promise<ActionResult> {
  const parsed = StartInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const scan = await loadScan(supabase, parsed.data.documentId, "digitise");
  if (typeof scan === "string") return { ok: false, error: scan };

  let job: { jobId: string; status: string };
  try {
    job = await startDigitise(scan.file, parsed.data.language);
  } catch (e) {
    return { ok: false, error: ocrErrorMessage(e) };
  }
  const err = await recordJob(supabase, scan, "digitise", job.jobId, job.status, parsed.data.language);
  if (err) return { ok: false, error: err };

  revalidatePath(`/dashboard/cases/${scan.doc.case_id}`);
  return { ok: true, message: "OCR started — this usually takes under a minute." };
}

/** Field extraction: Sarvam fills our loan-file schema from the scan. */
export async function startExtraction(documentId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(documentId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const scan = await loadScan(supabase, documentId, "extract");
  if (typeof scan === "string") return { ok: false, error: scan };

  let job: { jobId: string; status: string };
  try {
    job = await startExtract(scan.file, extractionSchema());
  } catch (e) {
    return { ok: false, error: ocrErrorMessage(e) };
  }
  const err = await recordJob(supabase, scan, "extract", job.jobId, job.status, "auto");
  if (err) return { ok: false, error: err };

  revalidatePath(`/dashboard/cases/${scan.doc.case_id}`);
  return { ok: true, message: "Extraction started." };
}

/** Stores per-page OCR text, encrypted. Returns pages saved or an error message. */
async function saveDigitise(supabase: Supabase, job: { org_id: string; document_id: string; provider_job_id: string }) {
  const pages = await jobPages(job.provider_job_id);
  const rows = pages.map((p) => ({
    org_id: job.org_id,
    document_id: job.document_id,
    page_no: p.pageNo,
    ocr_text_enc: encryptText(p.text),
  }));
  if (rows.length) {
    const { error } = await supabase.from("document_pages").upsert(rows, { onConflict: "document_id,page_no" });
    if (error) return { saved: 0, error: "Could not save the OCR text." };
  }
  await supabase.from("documents").update({ page_count: pages.length }).eq("id", job.document_id);
  return { saved: rows.length, error: null };
}

/**
 * Stores extracted fields for drafter review. Every value is validated in code; the raw text
 * is kept (encrypted) next to the normalised value. Fields a human already verified are never
 * overwritten by a later extraction.
 */
async function saveExtraction(supabase: Supabase, job: { org_id: string; document_id: string; provider_job_id: string }, caseId: string) {
  const { result, annotations } = await jobExtraction(job.provider_job_id);
  const { data: verified } = await supabase
    .from("extracted_fields")
    .select("field_key")
    .eq("case_id", caseId)
    .not("verified_at", "is", null);
  const locked = new Set((verified ?? []).map((v) => v.field_key));

  const rows = FIELDS.flatMap((f) => {
    const raw = result[f.key];
    if (typeof raw !== "string" && typeof raw !== "number") return [];
    const text = String(raw).trim();
    if (!text || locked.has(f.key)) return [];
    const n = normalise(f.kind, text);
    return [
      {
        org_id: job.org_id,
        case_id: caseId,
        field_key: f.key,
        value_enc: encryptText(JSON.stringify({ raw: text, stored: n.ok ? n.stored : null, reason: n.ok ? null : n.reason })),
        confidence: confidenceOf(annotations, f.key),
        document_id: job.document_id,
        verified_by: null,
        verified_at: null,
      },
    ];
  });
  if (rows.length) {
    const { error } = await supabase.from("extracted_fields").upsert(rows, { onConflict: "case_id,field_key" });
    if (error) return { saved: 0, error: "Could not save extracted fields." };
  }
  return { saved: rows.length, error: null };
}

/**
 * Polls one job. On completion stores its output (OCR text or extracted fields), logs usage
 * and advances the case. Safe to call repeatedly.
 */
export async function refreshOcr(jobRowId: string): Promise<ActionResult & { done?: boolean }> {
  if (!z.uuid().safeParse(jobRowId).success) return { ok: false, error: "Invalid job." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data: job } = await supabase
    .from("ocr_jobs")
    .select("id, org_id, document_id, pipeline, provider_job_id, status, documents(case_id)")
    .eq("id", jobRowId)
    .single();
  if (!job) return { ok: false, error: "Job not found." };
  const caseId = (Array.isArray(job.documents) ? job.documents[0] : job.documents)?.case_id as string | undefined;
  if (job.status !== "running") return { ok: true, message: "Already finished.", done: true };
  if (!caseId) return { ok: false, error: "Document is not linked to a case.", done: true };

  let st: Awaited<ReturnType<typeof jobStatus>>;
  try {
    st = await jobStatus(job.provider_job_id);
  } catch (e) {
    return { ok: false, error: ocrErrorMessage(e) };
  }
  if (st.status === "running") {
    await supabase.from("ocr_jobs").update({ pages_total: st.pagesTotal }).eq("id", job.id);
    return { ok: true, message: "Still processing…", done: false };
  }

  const extract = job.pipeline === "extract";
  let saved = 0;
  let failure: string | null = null;
  if (st.status === "completed" || st.status === "partially_completed") {
    try {
      const out = extract ? await saveExtraction(supabase, job, caseId) : await saveDigitise(supabase, job);
      saved = out.saved;
      failure = out.error;
    } catch (e) {
      failure = ocrErrorMessage(e);
    }
  } else {
    failure = st.status === "rejected" ? "Sarvam rejected the document." : "Processing failed for this document.";
  }

  await supabase
    .from("ocr_jobs")
    .update({
      status: failure && !saved ? "failed" : st.status,
      pages_total: st.pagesTotal,
      pages_succeeded: extract ? st.pagesSucceeded : (st.pagesSucceeded ?? saved),
      error: failure,
    })
    .eq("id", job.id);

  const pagesBilled = extract ? (st.pagesSucceeded ?? 0) : saved;
  if (pagesBilled) {
    await supabase.from("usage_events").insert({
      org_id: job.org_id,
      case_id: caseId,
      kind: "ocr_page",
      qty: pagesBilled,
      cost_paise: pagesBilled * (extract ? EXTRACT_COST_PAISE_PER_PAGE : COST_PAISE_PER_PAGE),
      meta: { provider: "sarvam", pipeline: job.pipeline, job: job.provider_job_id },
    });
  }

  if (saved) {
    const { data: c } = await supabase.from("cases").select("id, status").eq("id", caseId).single();
    for (const to of ["docs_uploaded", "extraction_review"] as CaseStatus[]) {
      if (c && canTransition(c.status as CaseStatus, to)) {
        await supabase.from("cases").update({ status: to }).eq("id", caseId);
        c.status = to;
      }
    }
  }

  revalidatePath(`/dashboard/cases/${caseId}`);
  if (failure) return { ok: false, error: failure, done: true };
  return { ok: true, message: extract ? `Extracted ${saved} field(s) — review below.` : `OCR done — ${saved} page(s).`, done: true };
}

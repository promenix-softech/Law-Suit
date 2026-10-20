"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canTransition, type CaseStatus } from "@civil-suits/domain";
import { encryptText } from "@/lib/crypto";
import {
  COST_PAISE_PER_PAGE,
  OCR_LANGUAGES,
  jobPages,
  jobStatus,
  ocrErrorMessage,
  startDigitise,
  type OcrLanguage,
} from "@/lib/ocr/sarvam";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

const StartInput = z.object({
  documentId: z.uuid(),
  language: z.enum(Object.keys(OCR_LANGUAGES) as [OcrLanguage, ...OcrLanguage[]]),
});

/** Sends a scan to Sarvam and records the job. Only the case's editors may run OCR. */
export async function startOcr(input: z.infer<typeof StartInput>): Promise<ActionResult> {
  const parsed = StartInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { documentId, language } = parsed.data;

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data: doc } = await supabase
    .from("documents")
    .select("id, org_id, case_id, storage_path")
    .eq("id", documentId)
    .single();
  if (!doc?.case_id) return { ok: false, error: "Document not found." };

  // Check rights before spending OCR credits; the insert below is enforced by RLS too.
  const { data: allowed } = await supabase.rpc("can_edit_case", { c_id: doc.case_id });
  if (!allowed) return { ok: false, error: "You cannot run OCR for this case." };

  const { count } = await supabase
    .from("ocr_jobs")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("status", "running");
  if (count) return { ok: false, error: "OCR is already running for this document." };

  const ext = doc.storage_path.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME[ext];
  if (!contentType) return { ok: false, error: "Only PDF, JPG or PNG scans can be OCR'd." };

  const { data: blob, error: dlErr } = await supabase.storage.from("case-files").download(doc.storage_path);
  if (dlErr || !blob) return { ok: false, error: "Could not read the scan from storage." };

  let job: { jobId: string; status: string };
  try {
    job = await startDigitise({ data: blob, filename: `scan.${ext}`, contentType }, language);
  } catch (e) {
    return { ok: false, error: ocrErrorMessage(e) };
  }

  const { error } = await supabase.from("ocr_jobs").insert({
    org_id: doc.org_id,
    document_id: documentId,
    provider_job_id: job.jobId,
    language,
    status: job.status,
  });
  if (error) return { ok: false, error: "Could not record the OCR job." };

  revalidatePath(`/dashboard/cases/${doc.case_id}`);
  return { ok: true, message: "OCR started — this usually takes under a minute." };
}

/**
 * Polls one job. When it finishes, stores each page's text encrypted, logs usage and moves
 * the case to extraction review. Safe to call repeatedly.
 */
export async function refreshOcr(jobRowId: string): Promise<ActionResult & { done?: boolean }> {
  if (!z.uuid().safeParse(jobRowId).success) return { ok: false, error: "Invalid job." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data: job } = await supabase
    .from("ocr_jobs")
    .select("id, org_id, document_id, provider_job_id, status, documents(case_id)")
    .eq("id", jobRowId)
    .single();
  if (!job) return { ok: false, error: "Job not found." };
  const caseId = (Array.isArray(job.documents) ? job.documents[0] : job.documents)?.case_id as string | undefined;
  if (job.status !== "running") return { ok: true, message: "Already finished.", done: true };

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

  let pagesSaved = 0;
  let failure: string | null = null;
  if (st.status === "completed" || st.status === "partially_completed") {
    try {
      const pages = await jobPages(job.provider_job_id);
      const rows = pages.map((p) => ({
        org_id: job.org_id,
        document_id: job.document_id,
        page_no: p.pageNo,
        ocr_text_enc: encryptText(p.text),
      }));
      if (rows.length) {
        const { error } = await supabase.from("document_pages").upsert(rows, { onConflict: "document_id,page_no" });
        if (error) failure = "Could not save the OCR text.";
        else pagesSaved = rows.length;
      }
      await supabase.from("documents").update({ page_count: pages.length }).eq("id", job.document_id);
    } catch (e) {
      failure = ocrErrorMessage(e);
    }
  } else {
    failure = st.status === "rejected" ? "Sarvam rejected the document." : "OCR failed for this document.";
  }

  await supabase
    .from("ocr_jobs")
    .update({
      status: failure && !pagesSaved ? "failed" : st.status,
      pages_total: st.pagesTotal,
      pages_succeeded: st.pagesSucceeded ?? pagesSaved,
      error: failure,
    })
    .eq("id", job.id);

  if (caseId && pagesSaved) {
    await supabase.from("usage_events").insert({
      org_id: job.org_id,
      case_id: caseId,
      kind: "ocr_page",
      qty: pagesSaved,
      cost_paise: pagesSaved * COST_PAISE_PER_PAGE,
      meta: { provider: "sarvam", pipeline: "digitise", job: job.provider_job_id },
    });
    const { data: c } = await supabase.from("cases").select("id, status").eq("id", caseId).single();
    for (const to of ["docs_uploaded", "extraction_review"] as CaseStatus[]) {
      if (c && canTransition(c.status as CaseStatus, to)) {
        await supabase.from("cases").update({ status: to }).eq("id", caseId);
        c.status = to;
      }
    }
  }

  if (caseId) revalidatePath(`/dashboard/cases/${caseId}`);
  return failure ? { ok: false, error: failure, done: true } : { ok: true, message: `OCR done — ${pagesSaved} page(s).`, done: true };
}

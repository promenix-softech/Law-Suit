"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

/**
 * Queue work for the document worker. The database checks the payload (the draft or
 * annexures must belong to this case, a bundle needs an approved case) and RLS checks
 * that the user may edit the case; the worker does the conversion off Vercel.
 */
async function queue(caseId: string, kind: "draft_pdf" | "efiling_bundle", payload: object): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data: c } = await supabase.from("cases").select("org_id").eq("id", caseId).single();
  if (!c) return { ok: false, error: "Case not found." };

  // A unique index allows one active bundle per case and one active PDF per version.
  const { error } = await supabase.from("doc_jobs").insert({ org_id: c.org_id, case_id: caseId, kind, payload });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Already in progress." };
    if (error.message.includes("approved plaint")) return { ok: false, error: "The plaint must be approved first." };
    return { ok: false, error: "You cannot queue this job for this case." };
  }
  revalidatePath(`/dashboard/cases/${caseId}`);
  return { ok: true, message: kind === "draft_pdf" ? "PDF/A conversion queued." : "E-filing bundle queued." };
}

export async function queueDraftPdf(caseId: string, draftVersionId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(caseId).success || !z.uuid().safeParse(draftVersionId).success) {
    return { ok: false, error: "Invalid request." };
  }
  return queue(caseId, "draft_pdf", { draft_version_id: draftVersionId });
}

const Annexures = z
  .array(z.object({ document_id: z.uuid(), title: z.string().trim().min(1).max(120) }))
  .max(60)
  .refine((a) => new Set(a.map((x) => x.document_id)).size === a.length, "Each document once");

export async function queueBundle(caseId: string, annexures: unknown): Promise<ActionResult> {
  const parsed = Annexures.safeParse(annexures);
  if (!z.uuid().safeParse(caseId).success || !parsed.success) return { ok: false, error: "Give every annexure a title." };
  return queue(caseId, "efiling_bundle", { annexures: parsed.data });
}

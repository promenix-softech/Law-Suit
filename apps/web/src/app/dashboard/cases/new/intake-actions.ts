"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canTransition, type CaseStatus } from "@civil-suits/domain";
import { decryptText, encryptText } from "@/lib/crypto";
import { encodeField } from "@/lib/extract/stored";
import { extractionSchema, FIELD_BY_KEY, FIELDS, normalise } from "@/lib/extract/fields";
import { intakeFields, needsOwnTick, type IntakeField } from "@/lib/extract/intake";
import { CaseHeader, insertCase } from "@/lib/new-case";
import { EXTRACT_COST_PAISE_PER_PAGE, jobExtraction, jobStatus, ocrErrorMessage, startExtract } from "@/lib/ocr/sarvam";
import { createClient } from "@/lib/supabase/server";
import { isUploadName, uploadName } from "@/lib/upload-name";
import { applyVerifiedFields } from "../[id]/extract-actions";

/**
 * Opening a case from the bank's file: the admin uploads the file to their own intake area
 * (storage bucket `case-intake`, `{org}/{user}/<generated name>`), the AI reads it, the admin
 * checks every value and only then is the case opened. Nothing reaches the case tables before.
 * AI output is untrusted: every value is cleaned and checked in code (`normalise`), and only the
 * values a person ticked are stored as verified.
 */

const BUCKET = "case-intake";
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Me = { userId: string; orgId: string };

async function adminContext(): Promise<{ supabase: Supabase; me: Me } | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Database is not configured." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sign in again." };
  const [{ data: me }, { data: isAdmin }] = await Promise.all([
    supabase.from("profiles").select("org_id").eq("id", auth.user.id).single(),
    supabase.rpc("has_role", { r: "admin" }),
  ]);
  if (!me || isAdmin !== true) return { error: "Only an admin can open cases." };
  return { supabase, me: { userId: auth.user.id, orgId: me.org_id as string } };
}

/** Files left in the intake area longer than this were abandoned (an intake takes minutes). */
const LEFTOVER_MS = 24 * 3600 * 1000;

/**
 * The provider's job id is stored encrypted with the server's key: a value written straight into
 * the table through the API cannot point the server at another office's job.
 */
const sealJob = (jobId: string) => encryptText(`job:${jobId}`);
function openJob(sealed: string): string | null {
  try {
    const plain = decryptText(sealed);
    return plain.startsWith("job:") ? plain.slice(4) : null;
  } catch {
    return null;
  }
}

/** Removes the admin's own intake file (best effort; the leftover sweeps catch what this misses). */
async function drop(supabase: Supabase, path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

/**
 * The admin's own leftovers older than a day: abandoned intakes are discarded and their files
 * deleted, and files that never got an intake row (the tab was closed mid-way) are deleted.
 * Runs before each new upload; the worker sweeps every office the same way.
 */
async function sweepOwnLeftovers(supabase: Supabase, me: Me) {
  const cutoff = new Date(Date.now() - LEFTOVER_MS).toISOString();
  const { data: stale } = await supabase
    .from("case_intakes")
    .select("id, storage_path")
    .in("status", ["reading", "read", "failed"])
    .lt("created_at", cutoff)
    .limit(50);
  for (const row of stale ?? []) {
    await drop(supabase, row.storage_path);
    await supabase.from("case_intakes").update({ status: "discarded" }).eq("id", row.id);
  }
  const { data: files } = await supabase.storage.from(BUCKET).list(`${me.orgId}/${me.userId}`, { limit: 100 });
  const old = (files ?? []).filter((f) => f.created_at && f.created_at < cutoff).map((f) => `${me.orgId}/${me.userId}/${f.name}`);
  if (old.length) await supabase.storage.from(BUCKET).remove(old);
}

/** The admin's own intake file: `{org}/{user}/<generated name>` and nothing else. */
function isOwnIntakePath(path: string, me: Me): boolean {
  const parts = path.split("/");
  return parts.length === 3 && parts[0] === me.orgId && parts[1] === me.userId && isUploadName(parts[2]!, ["pdf", "jpg", "png"]);
}

export type IntakeResult =
  | { ok: true; intakeId: string; done: false }
  | { ok: true; intakeId: string; done: true; fields: IntakeField[]; pages: number | null; failed?: string }
  | { ok: false; error: string };

/** Step 1: the file is already in the admin's intake area; the AI starts reading it. */
export async function startIntake(path: string): Promise<IntakeResult> {
  const ctx = await adminContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, me } = ctx;
  if (typeof path !== "string" || !isOwnIntakePath(path, me)) return { ok: false, error: "Upload the file again." };
  await sweepOwnLeftovers(supabase, me).catch(() => undefined);
  const fail = async (error: string): Promise<IntakeResult> => {
    await drop(supabase, path);
    return { ok: false, error };
  };

  const { data: withinQuota } = await supabase.rpc("ai_quota_ok", {
    per_user_hour: Number(process.env.AI_JOBS_PER_USER_HOUR ?? 60),
    per_org_day: Number(process.env.AI_JOBS_PER_ORG_DAY ?? 1000),
  });
  if (!withinQuota) return fail("AI reading limit reached for now. Try again later, or type the case in.");

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !blob) return fail("Could not read the uploaded file.");
  const ext = path.split(".").pop()!;

  let jobId: string;
  try {
    jobId = (await startExtract({ data: blob, filename: `scan.${ext}`, contentType: MIME[ext]! }, extractionSchema())).jobId;
  } catch (e) {
    return fail(ocrErrorMessage(e));
  }
  const { data: row, error: insErr } = await supabase
    .from("case_intakes")
    .insert({ org_id: me.orgId, storage_path: path, provider_job_id: sealJob(jobId) })
    .select("id")
    .single();
  if (insErr || !row) return fail("Could not record the reading.");
  return { ok: true, intakeId: row.id as string, done: false };
}

/** Step 2: polled every few seconds until the AI has read the file; then the values to review. */
export async function readIntake(intakeId: string): Promise<IntakeResult> {
  if (!z.uuid().safeParse(intakeId).success) return { ok: false, error: "Invalid request." };
  const ctx = await adminContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase } = ctx;
  const { data: intake } = await supabase.from("case_intakes").select("id, provider_job_id, status, pages").eq("id", intakeId).maybeSingle();
  if (!intake) return { ok: false, error: "This upload is no longer available. Start again." };
  if (intake.status === "used" || intake.status === "discarded") return { ok: false, error: "This upload was already used or discarded." };

  const jobId = openJob(intake.provider_job_id);
  if (!jobId) return { ok: false, error: "This upload cannot be read. Start again." };
  const empty = () => intakeFields({}, {});
  if (intake.status === "failed") return { ok: true, intakeId, done: true, fields: empty(), pages: intake.pages, failed: "The AI could not read this file." };

  try {
    if (intake.status === "reading") {
      const st = await jobStatus(jobId);
      if (st.status === "running") return { ok: true, intakeId, done: false };
      if (st.status !== "completed" && st.status !== "partially_completed") {
        await supabase.from("case_intakes").update({ status: "failed", pages: st.pagesSucceeded ?? 0 }).eq("id", intakeId);
        return { ok: true, intakeId, done: true, fields: empty(), pages: null, failed: "The AI could not read this file." };
      }
      await supabase.from("case_intakes").update({ status: "read", pages: st.pagesSucceeded ?? st.pagesTotal ?? 0 }).eq("id", intakeId);
    }
    const { result, annotations } = await jobExtraction(jobId);
    return { ok: true, intakeId, done: true, fields: intakeFields(result, annotations), pages: intake.pages };
  } catch (e) {
    return { ok: false, error: ocrErrorMessage(e) };
  }
}

/** A short link to the uploaded file, to compare the values with it. */
export async function intakeFileUrl(intakeId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(intakeId).success) return { ok: false, error: "Invalid request." };
  const ctx = await adminContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { data: intake } = await ctx.supabase.from("case_intakes").select("storage_path, status").eq("id", intakeId).maybeSingle();
  if (!intake || intake.status === "used" || intake.status === "discarded") return { ok: false, error: "File not available." };
  const { data } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(intake.storage_path, 300);
  return data?.signedUrl ? { ok: true, url: data.signedUrl } : { ok: false, error: "File not available." };
}

/** The admin drops the upload: the file is deleted; the row stays (the AI quota counts it). */
export async function discardIntake(intakeId: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(intakeId).success) return { ok: false };
  const ctx = await adminContext();
  if ("error" in ctx) return { ok: false };
  const { data: intake } = await ctx.supabase.from("case_intakes").select("storage_path, status").eq("id", intakeId).maybeSingle();
  if (!intake) return { ok: false };
  if (intake.status !== "used" && intake.status !== "discarded") {
    await ctx.supabase.storage.from(BUCKET).remove([intake.storage_path]);
    await ctx.supabase.from("case_intakes").update({ status: "discarded" }).eq("id", intakeId);
  }
  return { ok: true };
}

const OpenInput = z.object({
  intakeId: z.uuid(),
  header: z.object({
    caseNo: z.string().max(100),
    branchId: z.string().max(100),
    courtId: z.string().max(100),
    drafterId: z.string().max(100),
    approverId: z.string().max(100),
    urgent: z.boolean(),
  }),
  fields: z
    .array(z.object({ key: z.string().refine((k) => FIELD_BY_KEY.has(k)), value: z.string().max(3000), checked: z.boolean() }))
    .max(FIELDS.length),
});

export type OpenResult =
  | { ok: true; caseId: string; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; caseId?: string };

/**
 * Step 3: the reviewed values open the case. Ticked values are stored as verified by this admin
 * and applied to the case (loan, borrower, guarantor, claim, 12A) by the same code as on the case
 * page; unticked ones are kept for the drafter to verify there. The file moves into the case.
 */
export async function openCaseFromIntake(input: z.input<typeof OpenInput>): Promise<OpenResult> {
  const parsed = OpenInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form." };
  const { intakeId, header, fields } = parsed.data;
  const ctx = await adminContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, me } = ctx;

  const { data: intake } = await supabase
    .from("case_intakes")
    .select("id, storage_path, status, provider_job_id, opening_at")
    .eq("id", intakeId)
    .maybeSingle();
  if (!intake || (intake.status !== "read" && intake.status !== "failed")) return { ok: false, error: "This upload is no longer available. Start again." };
  if (intake.opening_at) return { ok: false, error: "A case is already being opened from this file. Look for it on the dashboard." };

  // Every value is re-checked in code; a ticked value that does not validate stops the opening.
  const fieldErrors: Record<string, string> = {};
  const values = new Map<string, { raw: string; stored: string | null; reason: string | null; checked: boolean }>();
  for (const f of fields) {
    const raw = f.value.trim();
    if (!raw) continue;
    const def = FIELD_BY_KEY.get(f.key)!;
    const n = normalise(def.kind, raw);
    if (!n.ok && f.checked) fieldErrors[f.key] = `${def.label}: ${n.reason.toLowerCase()}.`;
    if (n.ok && def.maxLength && n.stored.length > def.maxLength) fieldErrors[f.key] = `${def.label}: shorten to ${def.maxLength} characters.`;
    values.set(f.key, { raw, stored: n.ok ? n.stored : null, reason: n.ok ? null : n.reason, checked: f.checked && n.ok });
  }
  const borrower = values.get("borrower_name");
  if (!borrower?.checked || !borrower.stored) fieldErrors.borrower_name ??= "Borrower name: check it and tick it — the case is opened in this name.";
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Some values need attention.", fieldErrors };

  const head = CaseHeader.safeParse({
    ...header,
    borrowerName: borrower!.stored!,
    borrowerAddress: values.get("borrower_address")?.checked ? (values.get("borrower_address")!.stored ?? undefined) : undefined,
  });
  if (!head.success) return { ok: false, error: head.error.issues[0]?.message ?? "Check the case details." };

  // One file opens one case: claim the intake first (a double click or a retry finds it claimed).
  const { data: claimed } = await supabase
    .from("case_intakes")
    .update({ opening_at: new Date().toISOString() })
    .eq("id", intakeId)
    .is("opening_at", null)
    .in("status", ["read", "failed"])
    .select("id");
  if (!claimed?.length) return { ok: false, error: "A case is already being opened from this file. Look for it on the dashboard." };

  const made = await insertCase(supabase, head.data);
  if ("error" in made) {
    await supabase.from("case_intakes").update({ opening_at: null }).eq("id", intakeId); // nothing was opened
    return { ok: false, error: made.error };
  }
  const caseId = made.caseId;
  const partial = (what: string): OpenResult => ({
    ok: false,
    caseId,
    error: `The case was opened, but ${what}. Open the case and upload the file there.`,
  });

  // The file moves into the case's scans, under a new generated name.
  const { data: blob } = await supabase.storage.from(BUCKET).download(intake.storage_path);
  if (!blob) return partial("the bank's file could not be moved into it");
  const ext = intake.storage_path.split(".").pop()!;
  const scanPath = `${me.orgId}/${caseId}/scans/${uploadName(MIME[ext]!)}`;
  const up = await supabase.storage.from("case-files").upload(scanPath, blob, { contentType: MIME[ext]! });
  if (up.error) return partial("the bank's file could not be moved into it");
  // Pages billed come from the provider, not from the row (which the browser could write).
  const jobId = openJob(intake.provider_job_id);
  let pages = 0;
  try {
    if (jobId) pages = (await jobStatus(jobId)).pagesSucceeded ?? 0;
  } catch {
    pages = 0;
  }
  const sha256 = createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex");
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({ org_id: me.orgId, case_id: caseId, storage_path: scanPath, sha256, doc_type: "scan", page_count: pages || null })
    .select("id")
    .single();
  if (docErr || !doc) return partial("the bank's file could not be recorded in it");

  const now = new Date().toISOString();
  const rows = [...values].map(([key, v]) => ({
    org_id: me.orgId,
    case_id: caseId,
    field_key: key,
    value_enc: encodeField({ raw: v.raw, stored: v.stored, reason: v.reason }),
    confidence: null,
    document_id: doc.id,
    verified_by: v.checked ? me.userId : null,
    verified_at: v.checked ? now : null,
    verified_method: v.checked ? (needsOwnTick(FIELD_BY_KEY.get(key)!.kind) ? "single" : "bulk") : null,
  }));
  if (rows.length) {
    const { error } = await supabase.from("extracted_fields").upsert(rows, { onConflict: "case_id,field_key" });
    if (error) return partial("the values could not be saved");
  }

  if (pages) {
    await supabase.from("usage_events").insert({
      org_id: me.orgId,
      case_id: caseId,
      kind: "ocr_page",
      qty: pages,
      cost_paise: pages * EXTRACT_COST_PAISE_PER_PAGE,
      meta: { provider: "sarvam", pipeline: "extract", intake: intakeId },
    });
  }

  // The case now has its file: docs uploaded, then values under review (as on the case page).
  const { data: c } = await supabase.from("cases").select("status").eq("id", caseId).single();
  let status = c?.status as CaseStatus | undefined;
  for (const to of ["docs_uploaded", "extraction_review"] as CaseStatus[]) {
    if (status && canTransition(status, to)) {
      const { error } = await supabase.from("cases").update({ status: to }).eq("id", caseId);
      if (!error) status = to;
    }
  }

  const applied = [...values.values()].some((v) => v.checked) ? await applyVerifiedFields(caseId) : null;

  // The intake is "used" once its file is gone; if the delete fails, the intake stays claimed (no
  // second case can come from it) and the leftover sweeps delete the file within a day.
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([intake.storage_path]);
  if (!rmErr) await supabase.from("case_intakes").update({ status: "used", case_id: caseId }).eq("id", intakeId);

  revalidatePath("/dashboard");
  const left = [...values.values()].filter((v) => !v.checked).length;
  return {
    ok: true,
    caseId,
    message:
      (applied && !applied.ok ? `Case opened. ${applied.error} ` : "Case opened. ") +
      (left ? `${left} value(s) left for the drafter to verify on the case page.` : "Every value was checked."),
  };
}

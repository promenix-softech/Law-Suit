"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canTransition, type CaseStatus } from "@civil-suits/domain";
import { buildDemandNotice } from "@civil-suits/templates";
import { renderDocx } from "@/lib/docx";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const BUCKET = "case-files";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const UploadInput = z.object({
  caseId: z.uuid(),
  path: z.string().min(1).max(500),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/** Records a scan the browser already uploaded to storage (storage RLS checked the upload). */
export async function recordUpload(input: z.infer<typeof UploadInput>): Promise<ActionResult> {
  const parsed = UploadInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload details." };
  const { caseId, path, sha256 } = parsed.data;

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data: c } = await supabase.from("cases").select("org_id").eq("id", caseId).single();
  if (!c) return { ok: false, error: "Case not found." };
  if (!path.startsWith(`${c.org_id}/${caseId}/scans/`)) return { ok: false, error: "Invalid storage path." };

  const { error } = await supabase
    .from("documents")
    .insert({ org_id: c.org_id, case_id: caseId, storage_path: path, sha256, doc_type: "scan" });
  if (error) return { ok: false, error: "You cannot add documents to this case." };

  revalidatePath(`/dashboard/cases/${caseId}`);
  return { ok: true, message: "Document uploaded." };
}

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Builds the demand notice from case data, stores it as a new draft version (DOCX). */
export async function generateDemandNotice(caseId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(caseId).success) return { ok: false, error: "Invalid case." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data: c } = await supabase
    .from("cases")
    .select(
      "id, org_id, case_no_internal, status, is_commercial, organizations(name), bank_branches(branch_name, banks(name)), parties(name, role, address, position), loans(facility_type, account_last4, sanction_date, sanction_amount_paise, roi_bps, npa_date, outstanding_paise, interest_upto_date)",
    )
    .eq("id", caseId)
    .single();
  if (!c) return { ok: false, error: "Case not found." };

  const loan = one(c.loans);
  const branch = one(c.bank_branches) as { branch_name: string; banks: Rel<{ name: string }> } | null;
  const org = one(c.organizations) as { name: string } | null;
  if (!loan || loan.outstanding_paise == null || !loan.interest_upto_date) {
    return { ok: false, error: "Loan details (outstanding amount and date) are missing." };
  }
  const parties = [...(c.parties ?? [])].sort((a, b) => a.position - b.position);
  if (!parties.length) return { ok: false, error: "Add at least one borrower first." };

  // Version number first, so the reference and file name carry it.
  let { data: draft } = await supabase
    .from("drafts")
    .select("id, current_version")
    .eq("case_id", caseId)
    .eq("doc_kind", "demand_notice")
    .eq("language", "en")
    .maybeSingle();
  if (!draft) {
    const created = await supabase
      .from("drafts")
      .insert({ org_id: c.org_id, case_id: caseId, doc_kind: "demand_notice", language: "en" })
      .select("id, current_version")
      .single();
    if (created.error) return { ok: false, error: "You cannot draft documents for this case." };
    draft = created.data;
  }
  const version = draft.current_version + 1;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD in IST

  const model = buildDemandNotice({
    noticeDate: today,
    refNo: `${c.case_no_internal}/DN/${version}`,
    advocate: { officeName: org?.name ?? "Advocates", address: "" },
    bank: { name: one(branch?.banks ?? null)?.name ?? "the Bank", branch: branch?.branch_name ?? "" },
    borrowers: parties.map((p) => ({ name: p.name, role: p.role, address: p.address })),
    loan: {
      facilityType: loan.facility_type ?? "Loan",
      accountLast4: loan.account_last4,
      sanctionDate: loan.sanction_date,
      sanctionAmountPaise: loan.sanction_amount_paise == null ? null : Number(loan.sanction_amount_paise),
      rateBps: loan.roi_bps,
      npaDate: loan.npa_date,
      outstandingPaise: Number(loan.outstanding_paise),
      interestUptoDate: loan.interest_upto_date,
    },
    paymentDays: 15,
    isCommercial: c.is_commercial,
  });

  const file = await renderDocx(model);
  const path = `${c.org_id}/${caseId}/drafts/demand_notice-en-v${version}-${Date.now()}.docx`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: DOCX_MIME });
  if (up.error) return { ok: false, error: "Could not store the generated file." };

  const ver = await supabase
    .from("draft_versions")
    .insert({ org_id: c.org_id, draft_id: draft.id, version, docx_path: path, diff_summary: `${model.templateId} v${model.version}` });
  if (ver.error) return { ok: false, error: "Could not save the draft version." };
  await supabase.from("drafts").update({ current_version: version }).eq("id", draft.id);

  if (canTransition(c.status as CaseStatus, "notice_generated")) {
    await supabase.from("cases").update({ status: "notice_generated" }).eq("id", caseId);
  }

  revalidatePath(`/dashboard/cases/${caseId}`);
  return { ok: true, message: `Demand notice v${version} generated.` };
}

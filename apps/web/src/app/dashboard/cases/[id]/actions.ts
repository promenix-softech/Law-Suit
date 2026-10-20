"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canTransition, maharashtraCourtFee, type CaseStatus } from "@civil-suits/domain";
import { buildDemandNotice, buildPlaint, type DocModel, type SuitType } from "@civil-suits/templates";
import { renderDocx } from "@/lib/docx";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const BUCKET = "case-files";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD

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

const CASE_SELECT =
  "id, org_id, case_no_internal, status, suit_type, is_commercial, urgent_interim_relief, claim_amount_paise, organizations(name), courts(name, district), bank_branches(branch_name, banks(name)), parties(name, role, address, position), loans(facility_type, account_last4, sanction_date, sanction_amount_paise, roi_bps, npa_date, outstanding_paise, interest_upto_date), notices(sent_at), mediations(outcome, report_path, updated_at)";

type CaseRow = {
  id: string;
  org_id: string;
  case_no_internal: string;
  status: CaseStatus;
};

type PartyRow = { name: string; role: "borrower" | "co_borrower" | "guarantor"; address: string | null; position: number };
type LoanRow = {
  facility_type: string | null;
  account_last4: string | null;
  sanction_date: string | null;
  sanction_amount_paise: number | string | null;
  roi_bps: number | null;
  npa_date: string | null;
  outstanding_paise: number | string | null;
  interest_upto_date: string | null;
};
/** Shape of CASE_SELECT; to-one relations may come back as object or single-item array. */
type CaseDetail = CaseRow & {
  suit_type: SuitType | null;
  is_commercial: boolean;
  urgent_interim_relief: boolean;
  claim_amount_paise: number | string | null;
  organizations: Rel<{ name: string }>;
  courts: Rel<{ name: string; district: string }>;
  bank_branches: Rel<{ branch_name: string; banks: Rel<{ name: string }> }>;
  parties: PartyRow[] | null;
  loans: Rel<LoanRow>;
  notices: { sent_at: string | null }[] | null;
  mediations: { outcome: string | null; report_path: string | null; updated_at: string }[] | null;
};

function courtFeeOrNull(paise: number): number | null {
  try {
    return maharashtraCourtFee(paise);
  } catch {
    return null; // slab below ₹1 lakh not verified yet; template flags it
  }
}

/** Assembles the template for one document kind from case data. Amounts come from the DB / domain code. */
function buildModel(kind: DocKind, c: CaseDetail, version: number): DocModel | string {
  const loan = one(c.loans);
  const branch = one(c.bank_branches);
  const parties = [...(c.parties ?? [])].sort((a, b) => a.position - b.position);
  if (!parties.length) return "Add at least one borrower first.";
  if (!loan || loan.outstanding_paise == null || !loan.interest_upto_date) {
    return "Loan details (outstanding amount and date) are missing.";
  }
  const bank = { name: one(branch?.banks ?? null)?.name ?? "the Bank", branch: branch?.branch_name ?? "" };
  const loanBase = {
    facilityType: loan.facility_type ?? "Loan",
    accountLast4: loan.account_last4,
    sanctionDate: loan.sanction_date,
    sanctionAmountPaise: loan.sanction_amount_paise == null ? null : Number(loan.sanction_amount_paise),
    rateBps: loan.roi_bps,
    npaDate: loan.npa_date,
  };

  if (kind === "demand_notice") {
    return buildDemandNotice({
      noticeDate: todayIST(),
      refNo: `${c.case_no_internal}/DN/${version}`,
      advocate: { officeName: one(c.organizations)?.name ?? "Advocates", address: "" },
      bank,
      borrowers: parties.map((p) => ({ name: p.name, role: p.role, address: p.address })),
      loan: { ...loanBase, outstandingPaise: Number(loan.outstanding_paise), interestUptoDate: loan.interest_upto_date },
      paymentDays: 15,
      isCommercial: c.is_commercial,
    });
  }

  const court = one(c.courts);
  if (!court) return "Assign a court to the case first.";
  const claim = Number(c.claim_amount_paise ?? loan.outstanding_paise);
  const sent = (c.notices ?? []).flatMap((n) => (n.sent_at ? [n.sent_at] : [])).sort().pop();
  const med = (c.mediations ?? []).find(
    (m): m is { outcome: "failed" | "non_starter"; report_path: string; updated_at: string } =>
      (m.outcome === "failed" || m.outcome === "non_starter") && !!m.report_path,
  );
  const suitType: SuitType = c.suit_type ?? (c.is_commercial ? "commercial" : "ordinary");

  return buildPlaint({
    court: { name: courtTitle(court.name, court.district), place: court.district },
    year: Number(todayIST().slice(0, 4)),
    suitType,
    bank,
    defendants: parties.map((p) => ({ name: p.name, role: p.role, address: p.address })),
    loan: loanBase,
    claimPaise: claim,
    claimAsOn: loan.interest_upto_date,
    courtFeePaise: courtFeeOrNull(claim),
    notice: sent ? { date: sent.slice(0, 10) } : null,
    mediation: med ? { reportDate: String(med.updated_at).slice(0, 10), outcome: med.outcome } : null,
    urgentInterimRelief: c.urgent_interim_relief,
    filingDate: todayIST(),
  });
}

/** "Civil Judge Senior Division, Pune (Demo)" → "Civil Judge Senior Division" (place is printed separately). */
function courtTitle(name: string, district: string): string {
  const base = name.replace(/\s*\(Demo\)$/, "");
  const suffix = `, ${district}`;
  return base.endsWith(suffix) ? base.slice(0, -suffix.length) : base;
}

async function setCaseStatus(supabase: Supabase, c: CaseRow, to: CaseStatus) {
  if (canTransition(c.status, to)) await supabase.from("cases").update({ status: to }).eq("id", c.id);
}

const DocKindSchema = z.enum(["demand_notice", "plaint"]);
type DocKind = z.infer<typeof DocKindSchema>;
const LABEL: Record<DocKind, string> = { demand_notice: "Demand notice", plaint: "Plaint" };

/** Builds a document from case data and stores it as a new draft version (DOCX). */
export async function generateDraft(caseId: string, kindInput: string): Promise<ActionResult> {
  const kind = DocKindSchema.safeParse(kindInput);
  if (!z.uuid().safeParse(caseId).success || !kind.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data: c } = await supabase.from("cases").select(CASE_SELECT).eq("id", caseId).single();
  if (!c) return { ok: false, error: "Case not found." };

  let { data: draft } = await supabase
    .from("drafts")
    .select("id, current_version")
    .eq("case_id", caseId)
    .eq("doc_kind", kind.data)
    .eq("language", "en")
    .maybeSingle();
  if (!draft) {
    const created = await supabase
      .from("drafts")
      .insert({ org_id: c.org_id, case_id: caseId, doc_kind: kind.data, language: "en" })
      .select("id, current_version")
      .single();
    if (created.error) return { ok: false, error: "You cannot draft documents for this case." };
    draft = created.data;
  }
  const version = draft.current_version + 1;

  const model = buildModel(kind.data, c as unknown as CaseDetail, version);
  if (typeof model === "string") return { ok: false, error: model };

  const file = await renderDocx(model);
  const path = `${c.org_id}/${caseId}/drafts/${kind.data}-en-v${version}-${Date.now()}.docx`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: DOCX_MIME });
  if (up.error) return { ok: false, error: "Could not store the generated file." };

  const ver = await supabase
    .from("draft_versions")
    .insert({ org_id: c.org_id, draft_id: draft.id, version, docx_path: path, diff_summary: `${model.templateId} v${model.version}` });
  if (ver.error) return { ok: false, error: "Could not save the draft version." };
  // A new version always needs a fresh approval.
  await supabase.from("drafts").update({ current_version: version, status: "draft" }).eq("id", draft.id);

  await setCaseStatus(supabase, c as CaseRow, kind.data === "demand_notice" ? "notice_generated" : "drafting");

  revalidatePath(`/dashboard/cases/${caseId}`);
  return { ok: true, message: `${LABEL[kind.data]} v${version} generated.` };
}

/** Drafter sends the current version to the approver. */
export async function submitForApproval(draftId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(draftId).success) return { ok: false, error: "Invalid draft." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data: d } = await supabase
    .from("drafts")
    .select("id, case_id, doc_kind, status, current_version, cases(id, status)")
    .eq("id", draftId)
    .single();
  if (!d) return { ok: false, error: "Draft not found." };
  if (d.current_version < 1) return { ok: false, error: "Generate the document first." };
  if (d.status !== "draft" && d.status !== "returned") return { ok: false, error: "Draft is already submitted or approved." };

  const { data: updated, error } = await supabase
    .from("drafts")
    .update({ status: "in_approval" })
    .eq("id", draftId)
    .select("id");
  if (error || !updated?.length) return { ok: false, error: "You cannot submit this draft." };

  const c = one(d.cases) as CaseRow | null;
  if (d.doc_kind === "plaint" && c) await setCaseStatus(supabase, c, "in_approval");

  revalidatePath(`/dashboard/cases/${d.case_id}`);
  return { ok: true, message: "Sent for approval." };
}

const Decision = z.object({
  draftId: z.uuid(),
  decision: z.enum(["approved", "returned"]),
  comments: z.string().trim().max(2000).optional(),
});

/** Approver's decision. The database enforces approver ≠ author and applies the outcome. */
export async function decideDraft(input: z.infer<typeof Decision>): Promise<ActionResult> {
  const parsed = Decision.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid decision." };
  const { draftId, decision, comments } = parsed.data;
  if (decision === "returned" && !comments) return { ok: false, error: "Add a comment explaining what to fix." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data: d } = await supabase.from("drafts").select("org_id, case_id").eq("id", draftId).single();
  if (!d) return { ok: false, error: "Draft not found." };

  const { error } = await supabase
    .from("approvals")
    .insert({ org_id: d.org_id, draft_id: draftId, decision, comments: comments || null });
  if (error) {
    if (error.message.includes("maker-checker")) return { ok: false, error: "You cannot approve a draft you prepared." };
    if (error.message.includes("not awaiting approval")) return { ok: false, error: "This draft is not awaiting approval." };
    return { ok: false, error: "You are not allowed to approve drafts." };
  }

  revalidatePath(`/dashboard/cases/${d.case_id}`);
  revalidatePath("/dashboard");
  return { ok: true, message: decision === "approved" ? "Approved." : "Returned to the drafter." };
}

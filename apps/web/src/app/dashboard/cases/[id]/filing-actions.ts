"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canTransition, normaliseCnr, parseCnr, type CaseStatus } from "@civil-suits/domain";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/ui";
import type { ActionResult } from "./actions";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

async function loadCase(supabase: Supabase, caseId: string) {
  const { data } = await supabase.from("cases").select("id, org_id, status, needs_12a").eq("id", caseId).single();
  return data as { id: string; org_id: string; status: CaseStatus; needs_12a: boolean } | null;
}

/** One step forward after approval: notary / stamp done, then ready for e-filing. */
const StepInput = z.object({ caseId: z.uuid(), to: z.enum(["notary_stamp", "efiling_ready"]) });

export async function advanceFiling(input: z.input<typeof StepInput>): Promise<ActionResult> {
  const parsed = StepInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const c = await loadCase(supabase, parsed.data.caseId);
  if (!c) return { ok: false, error: "Case not found." };
  if (!canTransition(c.status, parsed.data.to, { needs12A: c.needs_12a })) {
    return { ok: false, error: "This step is not next for this case." };
  }
  const { data, error } = await supabase.from("cases").update({ status: parsed.data.to }).eq("id", c.id).select("id");
  if (error?.code === "23514") return { ok: false, error: "Build the e-filing bundle again after the latest approval first." };
  if (error || !data?.length) return { ok: false, error: "You cannot update this case." };
  revalidatePath(`/dashboard/cases/${c.id}`);
  return { ok: true, message: parsed.data.to === "notary_stamp" ? "Notary / stamp recorded." : "Marked ready for e-filing." };
}

const FilingInput = z.object({
  caseId: z.uuid(),
  efilingNo: z.string().trim().min(1).max(60),
  filedOn: z.iso.date(),
  courtFeeRupees: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Court fee in rupees").optional().or(z.literal("")),
  txnId: z.string().trim().max(80).optional(),
});

/** The suit was e-filed: the acknowledgement number, date and court-fee payment; the case becomes "filed". */
export async function recordFiling(input: z.input<typeof FilingInput>): Promise<ActionResult> {
  const parsed = FilingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the e-filing number and date (court fee in rupees, e.g. 10430)." };
  const { caseId, efilingNo, filedOn, courtFeeRupees, txnId } = parsed.data;
  if (filedOn > todayIST()) return { ok: false, error: "Filing date cannot be in the future." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const c = await loadCase(supabase, caseId);
  if (!c) return { ok: false, error: "Case not found." };
  if (c.status !== "efiling_ready") return { ok: false, error: "Mark the case ready for e-filing first." };

  // Rupees → paise as an integer, without floating-point surprises.
  const fee = courtFeeRupees ? (() => {
    const [r, p = ""] = courtFeeRupees.split(".");
    return Number(r) * 100 + Number(p.padEnd(2, "0"));
  })() : null;
  // One database transaction: the filing record and the "filed" status are written together.
  const { error } = await supabase.rpc("record_filing", {
    p_case_id: c.id,
    p_efiling_no: efilingNo,
    p_filed_on: filedOn,
    p_fee_paise: fee,
    p_txn_id: txnId || "",
  });
  if (error) {
    if (error.code === "23514") return { ok: false, error: "Filing date must be between the case's opening and today." };
    return { ok: false, error: "You cannot record the filing for this case." };
  }

  revalidatePath(`/dashboard/cases/${c.id}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Filing recorded. Add the CNR and filing number when the court registers the suit." };
}

const RegistrationInput = z.object({
  caseId: z.uuid(),
  cnr: z.string().trim().max(30),
  filingNo: z.string().trim().max(60).optional(),
});

/** The court registered the suit: its CNR (validated in code) and filing / registration number. */
export async function recordRegistration(input: z.input<typeof RegistrationInput>): Promise<ActionResult> {
  const parsed = RegistrationInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the CNR and filing number." };
  const cnr = normaliseCnr(parsed.data.cnr);
  if (!parseCnr(cnr)) return { ok: false, error: "A CNR has 16 characters, e.g. MHPU010012342026 (4 letters, then 12 digits)." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const c = await loadCase(supabase, parsed.data.caseId);
  if (!c) return { ok: false, error: "Case not found." };
  if (!["filed", "listed", "disposed"].includes(c.status)) return { ok: false, error: "Record the filing first." };

  const { error } = await supabase
    .from("cases")
    .update({ cnr_no: cnr, filing_no: parsed.data.filingNo || null })
    .eq("id", c.id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This CNR could not be saved. Check the number." };
    return { ok: false, error: "You cannot update this case." };
  }
  revalidatePath(`/dashboard/cases/${c.id}`);
  return { ok: true, message: "CNR and filing number saved." };
}

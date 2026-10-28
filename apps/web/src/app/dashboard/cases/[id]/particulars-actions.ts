"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { commercialCheck, particularsOfClaim, suitRoute } from "@civil-suits/domain";
import { parseAmountPaise, parseDate } from "@/lib/extract/fields";
import { parseDocumentLines } from "@/lib/particulars";
import { loadOfficeConfig, OFFICE_CONFIG_ERROR } from "@/lib/office-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

const text = (max: number) => z.string().trim().max(max);
const LOCKED: string[] = ["in_approval", "approved", "notary_stamp", "efiling_ready", "filed", "listed", "disposed"];

const ParticularsInput = z.object({
  caseId: z.uuid(),
  signatoryName: text(200),
  signatoryDesignation: text(100),
  signatoryAge: text(3),
  penalInterest: text(20),
  expenses: text(20),
  parties: z.array(z.object({ id: z.uuid(), throughCapacity: text(50), throughName: text(200) })).max(30),
  loans: z
    .array(z.object({ id: z.uuid(), applicationDate: text(20), purpose: text(200), tenureMonths: text(3), executedDocs: text(12_000) }))
    .max(10),
});
export type ParticularsForm = z.infer<typeof ParticularsInput>;

/**
 * Saves the particulars the office prints in the plaint but scans rarely carry: the bank's
 * signing officer, claim heads B (penal interest) and C (expenses), "through its Proprietor"
 * for a firm, and per facility the application date, purpose and executed documents.
 * The suit amount (A + B + C) is recomputed in code and the commercial check rerun.
 */
export async function saveParticulars(input: ParticularsForm): Promise<ActionResult> {
  const parsed = ParticularsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the particulars." };
  const v = parsed.data;

  const age = v.signatoryAge ? Number(v.signatoryAge) : null;
  if (age != null && !(Number.isInteger(age) && age >= 18 && age <= 100)) return { ok: false, error: "Officer's age must be 18–100." };
  const penal = v.penalInterest ? parseAmountPaise(v.penalInterest) : null;
  const expenses = v.expenses ? parseAmountPaise(v.expenses) : 0;
  if ((v.penalInterest && penal == null) || expenses == null) return { ok: false, error: "Penal interest and expenses must be amounts in rupees." };
  for (const p of v.parties) {
    if (!p.throughCapacity !== !p.throughName) return { ok: false, error: "'Through its …' needs both the capacity and the name." };
  }
  const loanPatches: { id: string; patch: Record<string, unknown> }[] = [];
  for (const [i, l] of v.loans.entries()) {
    const applicationDate = l.applicationDate ? parseDate(l.applicationDate) : null;
    if (l.applicationDate && !applicationDate) return { ok: false, error: `Facility ${i + 1}: application date is not a date.` };
    const tenure = l.tenureMonths ? Number(l.tenureMonths) : null;
    if (tenure != null && !(Number.isInteger(tenure) && tenure >= 1 && tenure <= 600)) return { ok: false, error: `Facility ${i + 1}: tenure must be 1–600 months.` };
    const docs = parseDocumentLines(l.executedDocs);
    if (!docs.ok) return { ok: false, error: `Facility ${i + 1}: cannot read document line ${docs.line} (use "Title | DD.MM.YYYY").` };
    loanPatches.push({ id: l.id, patch: { application_date: applicationDate, purpose: l.purpose || null, tenure_months: tenure, executed_docs: docs.docs } });
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data: c } = await supabase
    .from("cases")
    .select("id, status, suit_type, urgent_interim_relief, loans(id, outstanding_paise), parties(id)")
    .eq("id", v.caseId)
    .single();
  if (!c) return { ok: false, error: "Case not found." };
  // Once the plaint is with the approver, every paper must match it: no more changes.
  if (LOCKED.includes(c.status)) return { ok: false, error: "The plaint is in approval or approved — return it to drafting to change particulars." };
  const loanIds = new Set((c.loans ?? []).map((l) => l.id));
  const partyIds = new Set((c.parties ?? []).map((p) => p.id));
  if (loanPatches.some((l) => !loanIds.has(l.id)) || v.parties.some((p) => !partyIds.has(p.id))) {
    return { ok: false, error: "Those parties or facilities are not on this case." };
  }

  for (const p of v.parties) {
    const { error } = await supabase
      .from("parties")
      .update({ through_capacity: p.throughCapacity || null, through_name: p.throughName || null })
      .eq("id", p.id)
      .eq("case_id", v.caseId);
    if (error) return { ok: false, error: "You cannot edit the parties of this case." };
  }
  for (const l of loanPatches) {
    const { error } = await supabase.from("loans").update(l.patch).eq("id", l.id).eq("case_id", v.caseId);
    if (error) return { ok: false, error: "You cannot edit the facilities of this case." };
  }

  const outstanding = (c.loans ?? []).reduce((s, l) => s + Number(l.outstanding_paise ?? 0), 0);
  const claim = particularsOfClaim({ principalInterestPaise: outstanding, penalInterestPaise: penal, expensesPaise: expenses });
  const check = commercialCheck({ specifiedValuePaise: claim.totalPaise, lenderIsBank: true, urgentInterimRelief: c.urgent_interim_relief });
  const config = await loadOfficeConfig(supabase);
  if (!config) return { ok: false, error: OFFICE_CONFIG_ERROR };
  const route = suitRoute(check, config.settings.forum, c.suit_type);
  const { data: updated, error } = await supabase
    .from("cases")
    .update({
      signatory_name: v.signatoryName || null,
      signatory_designation: v.signatoryDesignation || null,
      signatory_age: age,
      penal_interest_paise: penal,
      expenses_paise: expenses,
      ...(outstanding
        ? {
            claim_amount_paise: claim.totalPaise,
            specified_value_paise: claim.totalPaise,
            is_commercial: route.isCommercial,
            needs_12a: route.needs12A,
            suit_type: route.suitType,
          }
        : {}),
    })
    .eq("id", v.caseId)
    .select("id");
  if (error || !updated?.length) return { ok: false, error: "You cannot edit this case." };

  revalidatePath(`/dashboard/cases/${v.caseId}`);
  return { ok: true, message: "Particulars saved — regenerate the plaint and the other papers so they carry them." };
}

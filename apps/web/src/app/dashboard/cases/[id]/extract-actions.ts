"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { commercialCheck } from "@civil-suits/domain";
import { encryptText } from "@/lib/crypto";
import { FIELD_BY_KEY, normalise } from "@/lib/extract/fields";
import { decodeField, encodeField } from "@/lib/extract/stored";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

const VerifyInput = z.object({
  caseId: z.uuid(),
  fieldKey: z.string().refine((k) => FIELD_BY_KEY.has(k), "Unknown field"),
  value: z.string().trim().min(1).max(300),
});

/**
 * The drafter confirms (or corrects) one extracted value. It is re-validated in code and
 * stamped with who verified it; only verified values can be applied to the case.
 */
export async function verifyField(input: z.infer<typeof VerifyInput>): Promise<ActionResult> {
  const parsed = VerifyInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a value to verify." };
  const { caseId, fieldKey, value } = parsed.data;
  const def = FIELD_BY_KEY.get(fieldKey)!;
  const n = normalise(def.kind, value);
  if (!n.ok) return { ok: false, error: `${def.label}: ${n.reason.toLowerCase()}.` };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in again." };

  const { data: row } = await supabase
    .from("extracted_fields")
    .select("id, value_enc")
    .eq("case_id", caseId)
    .eq("field_key", fieldKey)
    .maybeSingle();
  const raw = decodeField(row?.value_enc ?? null)?.raw ?? value;

  const { data: c } = await supabase.from("cases").select("org_id").eq("id", caseId).single();
  if (!c) return { ok: false, error: "Case not found." };

  const { error } = await supabase.from("extracted_fields").upsert(
    {
      org_id: c.org_id,
      case_id: caseId,
      field_key: fieldKey,
      value_enc: encodeField({ raw, stored: n.stored, reason: null }),
      verified_by: auth.user.id,
      verified_at: new Date().toISOString(),
    },
    { onConflict: "case_id,field_key" },
  );
  if (error) return { ok: false, error: "You cannot verify fields for this case." };

  revalidatePath(`/dashboard/cases/${caseId}`);
  return { ok: true, message: `${def.label} verified.` };
}

/**
 * Writes all verified values into the case's loan, borrower and claim. The claim's commercial
 * status and 12A requirement are recomputed in code from the verified outstanding amount.
 */
export async function applyVerifiedFields(caseId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(caseId).success) return { ok: false, error: "Invalid case." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data: c } = await supabase
    .from("cases")
    .select("id, org_id, suit_type, urgent_interim_relief, loans(id), parties(id, role, position, name)")
    .eq("id", caseId)
    .single();
  if (!c) return { ok: false, error: "Case not found." };

  const { data: rows } = await supabase
    .from("extracted_fields")
    .select("field_key, value_enc")
    .eq("case_id", caseId)
    .not("verified_at", "is", null);
  const v = new Map<string, string>();
  for (const r of rows ?? []) {
    const stored = decodeField(r.value_enc)?.stored;
    if (stored) v.set(r.field_key, stored);
  }
  if (!v.size) return { ok: false, error: "Verify at least one field first." };

  const loanPatch: Record<string, unknown> = {};
  if (v.has("facility_type")) loanPatch.facility_type = v.get("facility_type");
  if (v.has("loan_account_number")) {
    const acct = v.get("loan_account_number")!;
    loanPatch.account_no_enc = encryptText(acct);
    loanPatch.account_last4 = acct.slice(-4);
  }
  if (v.has("sanction_date")) loanPatch.sanction_date = v.get("sanction_date");
  if (v.has("sanction_amount")) loanPatch.sanction_amount_paise = Number(v.get("sanction_amount"));
  if (v.has("interest_rate")) loanPatch.roi_bps = Number(v.get("interest_rate"));
  if (v.has("npa_date")) loanPatch.npa_date = v.get("npa_date");
  if (v.has("outstanding_amount")) loanPatch.outstanding_paise = Number(v.get("outstanding_amount"));
  if (v.has("outstanding_as_on")) loanPatch.interest_upto_date = v.get("outstanding_as_on");

  const applied: string[] = [];
  const fail = (what: string): ActionResult => ({ ok: false, error: `Could not update ${what}.` });

  if (Object.keys(loanPatch).length) {
    const loanId = c.loans?.[0]?.id;
    const { error } = loanId
      ? await supabase.from("loans").update(loanPatch).eq("id", loanId)
      : await supabase.from("loans").insert({ org_id: c.org_id, case_id: caseId, ...loanPatch });
    if (error) return fail("the loan");
    applied.push("loan");
  }

  if (v.has("borrower_name") || v.has("borrower_address")) {
    const borrower = [...(c.parties ?? [])].filter((p) => p.role === "borrower").sort((a, b) => a.position - b.position)[0];
    const patch = {
      ...(v.has("borrower_name") ? { name: v.get("borrower_name") } : {}),
      ...(v.has("borrower_address") ? { address: v.get("borrower_address") } : {}),
    };
    const { error } = borrower
      ? await supabase.from("parties").update(patch).eq("id", borrower.id)
      : await supabase.from("parties").insert({ org_id: c.org_id, case_id: caseId, role: "borrower", position: 1, name: v.get("borrower_name") ?? "Borrower", ...patch });
    if (error) return fail("the borrower");
    applied.push("borrower");
  }

  const guarantor = v.get("guarantor_name");
  if (guarantor && !(c.parties ?? []).some((p) => p.role === "guarantor" && p.name === guarantor)) {
    const position = Math.max(0, ...(c.parties ?? []).map((p) => p.position)) + 1;
    const { error } = await supabase.from("parties").insert({ org_id: c.org_id, case_id: caseId, role: "guarantor", position, name: guarantor });
    if (error) return fail("the guarantor");
    applied.push("guarantor");
  }

  if (v.has("outstanding_amount")) {
    const claim = Number(v.get("outstanding_amount"));
    const check = commercialCheck({ specifiedValuePaise: claim, lenderIsBank: true, urgentInterimRelief: c.urgent_interim_relief });
    const { error } = await supabase
      .from("cases")
      .update({
        claim_amount_paise: claim,
        specified_value_paise: claim,
        is_commercial: check.isCommercial,
        needs_12a: check.needs12A,
        suit_type: check.isCommercial ? "commercial" : c.suit_type === "commercial" ? "ordinary" : c.suit_type,
      })
      .eq("id", caseId);
    if (error) return fail("the claim");
    applied.push("claim");
  }

  revalidatePath(`/dashboard/cases/${caseId}`);
  return { ok: true, message: `Applied to ${applied.join(", ")}.` };
}

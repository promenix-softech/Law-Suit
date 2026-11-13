import "server-only";
import { z } from "zod";
import { cleanText, hasLetter } from "@civil-suits/domain";
import type { createClient } from "@/lib/supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/** What every new case needs, however it is opened (typed in, or from the bank's file). */
export const CaseHeader = z
  .object({
    caseNo: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9/_-]+$/, "Use letters, digits, / - _ only"),
    branchId: z.uuid({ message: "Choose a bank branch" }),
    courtId: z.uuid({ message: "Choose a court" }),
    // Pasted names and addresses lose control and invisible characters before they are stored.
    borrowerName: z
      .string()
      .max(1200)
      .transform((s) => cleanText(s))
      .pipe(z.string().min(2).max(200).refine(hasLetter, "Enter the borrower's name")),
    borrowerAddress: z.string().max(1500).transform((s) => cleanText(s)).pipe(z.string().max(500)).optional(),
    facilityType: z.string().trim().max(100).optional(),
    drafterId: z.uuid({ message: "Choose a drafter" }),
    approverId: z.uuid({ message: "Choose an approver" }),
    urgent: z.boolean(),
  })
  .refine((v) => v.drafterId !== v.approverId, { message: "Drafter and approver must be different people", path: ["approverId"] });
export type CaseHeader = z.infer<typeof CaseHeader>;

/**
 * Inserts the case (admins only, by RLS) with its borrower and, if given, the facility.
 * The database enforces the rest: maker–checker, office, assignment rules.
 */
export async function insertCase(supabase: Supabase, v: CaseHeader): Promise<{ caseId: string; orgId: string } | { error: string }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sign in again." };
  const { data: me } = await supabase.from("profiles").select("org_id").eq("id", auth.user.id).single();
  if (!me) return { error: "Profile not found." };

  const { data: c, error } = await supabase
    .from("cases")
    .insert({
      org_id: me.org_id,
      case_no_internal: v.caseNo,
      bank_branch_id: v.branchId,
      court_id: v.courtId,
      assigned_drafter: v.drafterId,
      assigned_approver: v.approverId,
      urgent_interim_relief: v.urgent,
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error || !c) {
    if (error?.code === "23505") return { error: `Case number ${v.caseNo} already exists.` };
    return { error: "Only an admin can open cases." };
  }

  await supabase.from("parties").insert({
    org_id: me.org_id,
    case_id: c.id,
    role: "borrower",
    position: 1,
    name: v.borrowerName,
    address: v.borrowerAddress || null,
  });
  if (v.facilityType) await supabase.from("loans").insert({ org_id: me.org_id, case_id: c.id, facility_type: v.facilityType });
  return { caseId: c.id as string, orgId: me.org_id as string };
}

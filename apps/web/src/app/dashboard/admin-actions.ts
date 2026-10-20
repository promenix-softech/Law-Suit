"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string };

const NewCase = z
  .object({
    caseNo: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9/_-]+$/, "Use letters, digits, / - _ only"),
    branchId: z.uuid({ message: "Choose a bank branch" }),
    courtId: z.uuid({ message: "Choose a court" }),
    borrowerName: z.string().trim().min(2).max(200),
    borrowerAddress: z.string().trim().max(500).optional(),
    facilityType: z.string().trim().max(100).optional(),
    drafterId: z.uuid({ message: "Choose a drafter" }),
    approverId: z.uuid({ message: "Choose an approver" }),
    urgent: z.boolean(),
  })
  .refine((v) => v.drafterId !== v.approverId, { message: "Drafter and approver must be different people", path: ["approverId"] });

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v : undefined;
};

/** Admin opens a new case with its borrower and assigns a drafter and an approver. */
export async function createCase(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = NewCase.safeParse({
    caseNo: str(form, "caseNo"),
    branchId: str(form, "branchId"),
    courtId: str(form, "courtId"),
    borrowerName: str(form, "borrowerName"),
    borrowerAddress: str(form, "borrowerAddress"),
    facilityType: str(form, "facilityType"),
    drafterId: str(form, "drafterId"),
    approverId: str(form, "approverId"),
    urgent: form.get("urgent") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;

  const supabase = await createClient();
  if (!supabase) return { error: "Database is not configured." };
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
    address: v.borrowerAddress ?? null,
  });
  if (v.facilityType) await supabase.from("loans").insert({ org_id: me.org_id, case_id: c.id, facility_type: v.facilityType });

  revalidatePath("/dashboard");
  redirect(`/dashboard/cases/${c.id}`);
}

const Assign = z
  .object({ caseId: z.uuid(), drafterId: z.uuid(), approverId: z.uuid() })
  .refine((v) => v.drafterId !== v.approverId, { message: "Drafter and approver must be different people" });

/** Admin re-assigns a case. The database also rejects drafter = approver. */
export async function assignCase(input: z.infer<typeof Assign>): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = Assign.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid assignment." };
  const { caseId, drafterId, approverId } = parsed.data;

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data, error } = await supabase
    .from("cases")
    .update({ assigned_drafter: drafterId, assigned_approver: approverId })
    .eq("id", caseId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Only an admin can re-assign cases." };

  revalidatePath(`/dashboard/cases/${caseId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Assignment saved." };
}

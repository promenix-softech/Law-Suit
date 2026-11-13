"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CaseHeader, insertCase } from "@/lib/new-case";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string };

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v : undefined;
};

/** Admin opens a new case with its borrower and assigns a drafter and an approver. */
export async function createCase(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = CaseHeader.safeParse({
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
  const made = await insertCase(supabase, v);
  if ("error" in made) return { error: made.error };

  revalidatePath("/dashboard");
  redirect(`/dashboard/cases/${made.caseId}`);
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

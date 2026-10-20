"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const NewTask = z.object({
  caseId: z.uuid(),
  assigneeId: z.uuid(),
  kind: z.enum(["collect_docs", "notary", "efile", "dispatch_notice"]),
  dueOn: z.iso.date().optional(),
  instructions: z.string().trim().max(500).optional(),
});

/** Case editor (drafter/admin) assigns a field task; the DB checks the assignee is field staff. */
export async function createTask(input: z.infer<typeof NewTask>): Promise<ActionResult> {
  const parsed = NewTask.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the task details." };
  const v = parsed.data;
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data: c } = await supabase.from("cases").select("org_id").eq("id", v.caseId).single();
  if (!c) return { ok: false, error: "Case not found." };
  const { error } = await supabase.from("tasks").insert({
    org_id: c.org_id,
    case_id: v.caseId,
    assignee_id: v.assigneeId,
    role: "field",
    kind: v.kind,
    // Due by end of day IST.
    due_at: v.dueOn ? `${v.dueOn}T18:29:59Z` : null,
    instructions: v.instructions || null,
  });
  if (error) return { ok: false, error: "You cannot assign tasks on this case." };
  revalidatePath(`/dashboard/cases/${v.caseId}`);
  return { ok: true, message: "Task assigned." };
}

const Progress = z.object({
  taskId: z.uuid(),
  status: z.enum(["in_progress", "done"]),
  note: z.string().trim().max(500).optional(),
  proofPath: z.string().max(300).optional(),
});

/** Assignee reports progress. Only status, note and proof can change (DB-enforced). */
export async function updateTask(input: z.infer<typeof Progress>): Promise<ActionResult> {
  const parsed = Progress.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid update." };
  const v = parsed.data;
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: v.status, ...(v.note ? { note: v.note } : {}), ...(v.proofPath ? { proof_path: v.proofPath } : {}) })
    .eq("id", v.taskId)
    .select("id, case_id");
  if (error || !data?.length) return { ok: false, error: "Could not update this task." };
  revalidatePath("/dashboard/tasks");
  revalidatePath(`/dashboard/cases/${data[0]!.case_id}`);
  return { ok: true, message: v.status === "done" ? "Marked done." : "Started." };
}

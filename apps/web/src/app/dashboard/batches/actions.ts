"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const NewBatch = z.object({
  id: z.uuid(),
  path: z.string().min(1).max(300),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/** Records an uploaded bulk scan; the worker picks it up. Admin-only (RLS + DB checks). */
export async function createBatch(input: z.infer<typeof NewBatch>): Promise<ActionResult> {
  const parsed = NewBatch.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in again." };
  const { data: me } = await supabase.from("profiles").select("org_id").eq("id", auth.user.id).single();
  if (!me) return { ok: false, error: "Profile not found." };
  if (parsed.data.path !== `${me.org_id}/${parsed.data.id}/scan.pdf`) return { ok: false, error: "Invalid upload path." };

  const { error } = await supabase
    .from("batches")
    .insert({ id: parsed.data.id, org_id: me.org_id, storage_path: parsed.data.path, sha256: parsed.data.sha256 });
  if (error) return { ok: false, error: "Only an admin can start a bulk upload." };
  revalidatePath("/dashboard/batches");
  return { ok: true, message: "Uploaded. The worker will split and classify the pages; refresh in a minute." };
}

const Plan = z
  .array(
    z.object({
      pages: z.array(z.number().int().positive()).min(1),
      case_id: z.uuid().nullable(),
      case_no: z.string().trim().regex(/^[A-Za-z0-9/_-]{1,40}$/, "Case numbers: letters, digits, / _ - (max 40)").nullable(),
    }),
  )
  .min(1)
  .max(200)
  .refine((p) => p.every((g) => (g.case_id ? !g.case_no : !!g.case_no)), "Each group needs a new case number or an existing case");

/** Admin confirms the split; the database checks every page is used once. */
export async function confirmSplit(batchId: string, plan: unknown): Promise<ActionResult> {
  const parsed = Plan.safeParse(plan);
  if (!z.uuid().safeParse(batchId).success) return { ok: false, error: "Invalid batch." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the groups." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { error } = await supabase.rpc("confirm_batch", { p_batch: batchId, p_plan: parsed.data });
  if (error) {
    const known = ["every page must be assigned", "already used", "is invalid or repeated", "not waiting for review", "new case numbers must differ"];
    const hit = known.find((k) => error.message.includes(k));
    return { ok: false, error: hit ? `Cannot confirm: ${hit}.` : "Cannot confirm this split." };
  }
  revalidatePath(`/dashboard/batches/${batchId}`);
  revalidatePath("/dashboard/batches");
  return { ok: true, message: "Confirmed. The worker will create the case scans." };
}

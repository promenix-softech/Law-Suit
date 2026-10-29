"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

const ArchiveInput = z.object({ caseId: z.uuid(), reason: z.string().trim().min(3).max(500) });

/**
 * Admin only (the database refuses anyone else): the case leaves every list and becomes
 * read-only, but nothing is deleted; it can be restored at any time.
 */
export async function archiveCase(input: z.input<typeof ArchiveInput>): Promise<ActionResult> {
  const parsed = ArchiveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give a reason (3–500 characters)." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in again." };

  // archived_by and archived_at are overwritten by the database with the caller and its clock.
  const { data, error } = await supabase
    .from("cases")
    .update({ archived_at: new Date().toISOString(), archived_by: auth.user.id, archive_reason: parsed.data.reason })
    .eq("id", parsed.data.caseId)
    .is("archived_at", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Only an admin can archive a case." };

  revalidatePath(`/dashboard/cases/${parsed.data.caseId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Case archived. Find it under Archived on the dashboard." };
}

export async function restoreCase(caseId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(caseId).success) return { ok: false, error: "Invalid case." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { data, error } = await supabase
    .from("cases")
    .update({ archived_at: null, archived_by: null, archive_reason: null })
    .eq("id", caseId)
    .not("archived_at", "is", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Only an admin can restore a case." };

  revalidatePath(`/dashboard/cases/${caseId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Case restored." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../cases/[id]/actions";

const Input = z.object({
  userId: z.uuid(),
  role: z.enum(["admin", "drafter", "approver", "field"]),
  on: z.boolean(),
});

/**
 * Office admin grants or removes one role. RLS (roles_admin) refuses anyone else and every change
 * is in the audit log. An admin cannot drop their own admin role, so the office never locks itself out.
 */
export async function setRole(input: z.infer<typeof Input>): Promise<ActionResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid role change." };
  const { userId, role, on } = parsed.data;

  const db = await createClient();
  if (!db) return { ok: false, error: "Database is not configured." };
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in again." };
  if (!on && role === "admin" && userId === auth.user.id) return { ok: false, error: "You cannot remove your own admin role." };

  const [{ data: me }, { data: isAdmin }] = await Promise.all([
    db.from("profiles").select("org_id").eq("id", auth.user.id).single(),
    db.rpc("has_role", { r: "admin" }),
  ]);
  if (!me || !isAdmin) return { ok: false, error: "Only an office admin can change roles." };

  const { error } = on
    ? await db.from("user_roles").upsert({ user_id: userId, org_id: me.org_id, role }, { onConflict: "user_id,org_id,role", ignoreDuplicates: true })
    : await db.from("user_roles").delete().eq("user_id", userId).eq("org_id", me.org_id).eq("role", role);
  if (error) return { ok: false, error: "Could not change the role." };

  revalidatePath("/dashboard/team");
  return { ok: true, message: on ? `${role} role given.` : `${role} role removed.` };
}

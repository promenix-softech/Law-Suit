"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isStateCode } from "@civil-suits/domain";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../cases/[id]/actions";

const Name = z.string().trim().min(2).max(160);
const Ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC must look like SBIN0001234");

const BranchInput = z.object({
  id: z.uuid().optional(),
  bankName: Name,
  shortCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, "Short code: 2–12 letters or digits, e.g. SBI"),
  branchName: Name,
  ifsc: Ifsc.or(z.literal("")),
  address: z.string().trim().max(400),
});

const CourtInput = z.object({
  id: z.uuid().optional(),
  name: Name,
  district: Name,
  courtType: z.enum(["civil", "commercial", "drt"]),
  state: z.string().refine(isStateCode, "Choose a state"),
});

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/** Office id of the signed-in admin; RLS refuses writes from anyone else anyway. */
async function adminOrg(): Promise<{ db: Db; orgId: string } | string> {
  const db = await createClient();
  if (!db) return "Database is not configured.";
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return "Sign in again.";
  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    db.from("profiles").select("org_id").eq("id", auth.user.id).single(),
    db.rpc("has_role", { r: "admin" }),
  ]);
  if (!profile || !isAdmin) return "Only an office admin can change banks and courts.";
  return { db, orgId: profile.org_id };
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the fields.";

/** Adds or edits a branch; the bank is found by short code or created. */
export async function saveBranch(input: z.input<typeof BranchInput>): Promise<ActionResult> {
  const parsed = BranchInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await adminOrg();
  if (typeof ctx === "string") return { ok: false, error: ctx };
  const { db, orgId } = ctx;
  const v = parsed.data;

  const { data: bank, error: bankErr } = await db
    .from("banks")
    .upsert({ org_id: orgId, name: v.bankName, short_code: v.shortCode }, { onConflict: "org_id,short_code" })
    .select("id")
    .single();
  if (bankErr || !bank) return { ok: false, error: "Could not save the bank." };

  const row = { org_id: orgId, bank_id: bank.id, branch_name: v.branchName, ifsc: v.ifsc || null, address: v.address || null };
  const { error } = v.id ? await db.from("bank_branches").update(row).eq("id", v.id) : await db.from("bank_branches").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? "This branch already exists." : "Could not save the branch." };

  revalidatePath("/dashboard/masters");
  return { ok: true, message: v.id ? "Branch updated." : "Branch added — it now appears in the new-case form." };
}

export async function saveCourt(input: z.input<typeof CourtInput>): Promise<ActionResult> {
  const parsed = CourtInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await adminOrg();
  if (typeof ctx === "string") return { ok: false, error: ctx };
  const { db, orgId } = ctx;
  const v = parsed.data;

  const row = { org_id: orgId, name: v.name, district: v.district, court_type: v.courtType, state: v.state };
  const { error } = v.id ? await db.from("courts").update(row).eq("id", v.id) : await db.from("courts").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? "This court already exists." : "Could not save the court." };

  revalidatePath("/dashboard/masters");
  return { ok: true, message: v.id ? "Court updated." : "Court added — it now appears in the new-case form." };
}

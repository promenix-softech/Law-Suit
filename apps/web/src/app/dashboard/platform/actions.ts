"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PlatformResult = { ok: true; message: string } | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** An empty box means "no limit" (null); otherwise a whole number in range. */
const optionalCount = (max: number, min = 0) =>
  z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(min).max(max).nullable());

const SchemeInput = z
  .object({
    orgId: z.uuid(),
    schemeName: z.string().trim().min(2).max(60),
    period: z.enum(["monthly", "yearly"]),
    casesPerMonth: optionalCount(100_000),
    casesPerYear: optionalCount(1_200_000),
    validFrom: isoDate,
    validUntil: z.preprocess((v) => (v === "" || v == null ? null : v), isoDate.nullable()),
    onLimit: z.enum(["warn", "block"]),
    aiJobsPerDay: optionalCount(100_000),
    seats: optionalCount(1000, 1),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.validUntil == null || v.validUntil >= v.validFrom, { message: "The end date is before the start date." });

/**
 * Sets an office's scheme. The database function refuses anyone who is not a super admin and
 * writes the change to the office's audit chain; this only checks the form.
 */
export async function saveScheme(input: z.input<typeof SchemeInput>): Promise<PlatformResult> {
  const parsed = SchemeInput.safeParse(input);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom")?.message;
    return { ok: false, error: custom ?? "Check the scheme: a name, the dates and whole numbers are needed." };
  }
  const v = parsed.data;
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { error } = await supabase.rpc("platform_set_scheme", {
    p_org: v.orgId,
    p_scheme_name: v.schemeName,
    p_period: v.period,
    p_cases_per_month: v.casesPerMonth,
    p_cases_per_year: v.casesPerYear,
    p_valid_from: v.validFrom,
    p_valid_until: v.validUntil,
    p_on_limit: v.onLimit,
    p_ai_jobs_per_day: v.aiJobsPerDay,
    p_seats: v.seats,
    p_note: v.note ?? null,
  });
  if (error) return { ok: false, error: error.code === "42501" ? "Only the super admin can set an office's scheme." : "Could not save the scheme." };

  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Scheme saved." };
}

const SuspendInput = z.object({
  orgId: z.uuid(),
  suspended: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

/** Pauses or resumes an office. Pausing needs a reason, which the office's people are shown. */
export async function setSuspended(input: z.input<typeof SuspendInput>): Promise<PlatformResult> {
  const parsed = SuspendInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { orgId, suspended, reason } = parsed.data;
  if (suspended && !reason) return { ok: false, error: "Say why the office is paused — its people will see this." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { error } = await supabase.rpc("platform_set_suspended", { p_org: orgId, p_suspended: suspended, p_reason: reason ?? null });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Only the super admin can pause an office." };
    if (error.message.includes("own office")) return { ok: false, error: "The super admin's own office cannot be paused." };
    return { ok: false, error: "Could not change the office." };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: suspended ? "Office paused." : "Office resumed." };
}

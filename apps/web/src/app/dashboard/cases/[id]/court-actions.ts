"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DISPOSALS, HEARING_PURPOSES, hearingDateProblem } from "@civil-suits/domain";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/ui";
import type { ActionResult } from "./actions";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

const istDate = (ts: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

async function loadCase(supabase: Supabase, caseId: string) {
  const { data } = await supabase.from("cases").select("id, org_id, status, created_at").eq("id", caseId).single();
  return data as { id: string; org_id: string; status: string; created_at: string } | null;
}

const DATE_PROBLEM: Record<string, string> = {
  before_filing: "A hearing date cannot be before the case was opened.",
  too_far: "That date is more than two years away. Check the year.",
  duplicate: "This date is already on the diary.",
};

function done(caseId: string, message: string): ActionResult {
  revalidatePath(`/dashboard/cases/${caseId}`);
  revalidatePath("/dashboard");
  return { ok: true, message };
}

const HearingInput = z.object({
  caseId: z.uuid(),
  date: z.iso.date(),
  purpose: z.enum(HEARING_PURPOSES),
});

/** A new date on the court's board. The first one moves the case to "listed" (in the database). */
export async function addHearing(input: z.input<typeof HearingInput>): Promise<ActionResult> {
  const parsed = HearingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose the date and what it is for." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const c = await loadCase(supabase, parsed.data.caseId);
  if (!c) return { ok: false, error: "Case not found." };
  if (c.status !== "filed" && c.status !== "listed") return { ok: false, error: "Hearing dates are kept for a filed suit that is not yet disposed." };
  const problem = hearingDateProblem(parsed.data.date, { today: todayIST(), notBefore: istDate(c.created_at) });
  if (problem) return { ok: false, error: DATE_PROBLEM[problem] };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in again." };
  const { error } = await supabase
    .from("hearings")
    .insert({ org_id: c.org_id, case_id: c.id, hearing_date: parsed.data.date, purpose: parsed.data.purpose, created_by: auth.user.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: DATE_PROBLEM.duplicate };
    return { ok: false, error: "You cannot add a hearing date to this case." };
  }
  return done(c.id, "Hearing date saved.");
}

const RecordInput = z.object({
  caseId: z.uuid(),
  hearingId: z.uuid(),
  outcome: z.string().trim().min(1).max(2000),
  nextDate: z.iso.date().optional().or(z.literal("")),
  nextPurpose: z.enum(HEARING_PURPOSES).optional(),
});

/** What happened on a date and, usually, the next date the court gave: one transaction. */
export async function recordHearing(input: z.input<typeof RecordInput>): Promise<ActionResult> {
  const parsed = RecordInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write what happened on the date." };
  const { caseId, hearingId, outcome, nextDate, nextPurpose } = parsed.data;
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const c = await loadCase(supabase, caseId);
  if (!c) return { ok: false, error: "Case not found." };
  if (nextDate) {
    if (nextDate <= todayIST()) return { ok: false, error: "The next date must be after today." };
    const problem = hearingDateProblem(nextDate, { today: todayIST(), notBefore: istDate(c.created_at) });
    if (problem) return { ok: false, error: DATE_PROBLEM[problem] };
  }
  const { error } = await supabase.rpc("record_hearing", {
    p_hearing_id: hearingId,
    p_outcome: outcome,
    p_next_date: nextDate || null,
    p_next_purpose: nextPurpose ?? "other",
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: DATE_PROBLEM.duplicate };
    if (error.code === "23514") return { ok: false, error: "The outcome can be written on or after the hearing date." };
    return { ok: false, error: "You cannot update the hearing diary of this case." };
  }
  return done(c.id, nextDate ? "Saved. The next date is on the diary." : "Saved.");
}

const RemoveHearingInput = z.object({ caseId: z.uuid(), hearingId: z.uuid() });

/** Removes a date entered by mistake; a date that has been written up stays (the database refuses). */
export async function removeHearing(input: z.input<typeof RemoveHearingInput>): Promise<ActionResult> {
  const parsed = RemoveHearingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data, error } = await supabase
    .from("hearings")
    .delete()
    .eq("id", parsed.data.hearingId)
    .eq("case_id", parsed.data.caseId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "This date cannot be removed." };
  return done(parsed.data.caseId, "Date removed.");
}

const DisposeInput = z.object({
  caseId: z.uuid(),
  disposedOn: z.iso.date(),
  result: z.enum(DISPOSALS),
  note: z.string().trim().max(500).optional(),
});

/** The suit is over: date and result. Only an admin can change it afterwards. */
export async function disposeCase(input: z.input<typeof DisposeInput>): Promise<ActionResult> {
  const parsed = DisposeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose the date and the result." };
  const { caseId, disposedOn, result, note } = parsed.data;
  if (disposedOn > todayIST()) return { ok: false, error: "The disposal date cannot be in the future." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const c = await loadCase(supabase, caseId);
  if (!c) return { ok: false, error: "Case not found." };
  if (c.status !== "filed" && c.status !== "listed") return { ok: false, error: "Only a filed suit can be disposed." };
  const { data, error } = await supabase
    .from("cases")
    .update({ status: "disposed", disposed_on: disposedOn, disposal: result, disposal_note: note || null })
    .eq("id", c.id)
    .select("id");
  if (error?.code === "23514") return { ok: false, error: "The disposal date must be between the case's opening and today." };
  if (error || !data?.length) return { ok: false, error: "You cannot update this case." };
  return done(c.id, "Disposal recorded.");
}

const LimitationInput = z.object({
  caseId: z.uuid(),
  kind: z.enum(["acknowledgment", "part_payment"]),
  date: z.iso.date(),
  note: z.string().trim().max(500).optional(),
});

/** A written acknowledgement or part-payment: the limitation watch date is recomputed in code. */
export async function addLimitationEvent(input: z.input<typeof LimitationInput>): Promise<ActionResult> {
  const parsed = LimitationInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose the kind and the date." };
  const { caseId, kind, date, note } = parsed.data;
  if (date > todayIST()) return { ok: false, error: "The date cannot be in the future." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const c = await loadCase(supabase, caseId);
  if (!c) return { ok: false, error: "Case not found." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in again." };
  const { error } = await supabase
    .from("limitation_events")
    .insert({ org_id: c.org_id, case_id: c.id, kind, event_date: date, note: note || null, created_by: auth.user.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This entry is already recorded." };
    return { ok: false, error: "You cannot record this for the case." };
  }
  return done(c.id, "Saved. The limitation watch date is updated.");
}

const RemoveLimitationInput = z.object({ caseId: z.uuid(), eventId: z.uuid() });

export async function removeLimitationEvent(input: z.input<typeof RemoveLimitationInput>): Promise<ActionResult> {
  const parsed = RemoveLimitationInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const { data, error } = await supabase
    .from("limitation_events")
    .delete()
    .eq("id", parsed.data.eventId)
    .eq("case_id", parsed.data.caseId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "This entry cannot be removed." };
  return done(parsed.data.caseId, "Entry removed.");
}

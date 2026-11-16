"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  gstinValid,
  invoiceTotals,
  monthBounds,
  monthlyInvoiceLines,
  parseRupees,
  parseSlabs,
  type InvoiceLine,
} from "@civil-suits/domain";
import { SUPPLIER } from "@/lib/billing";
import { INVOICE_PREFIX, loadBillingPlans, planOn } from "@/lib/platform-billing";
import { createClient } from "@/lib/supabase/server";
import type { PlatformResult } from "./actions";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rupeeText = z.string().trim().max(20);

const PlanInput = z.object({
  orgId: z.uuid(),
  effectiveFrom: isoDate,
  /** Slabs as typed: an empty "upTo" closes the list (the last slab has no limit). */
  slabs: z.array(z.object({ upTo: z.string().trim().max(7), rate: rupeeText })).min(1).max(10),
  minimum: rupeeText,
  gstin: z.string().trim().toUpperCase().max(15),
  state: z.string().trim().regex(/^(0[1-9]|[1-3][0-9])$/),
  sac: z.string().trim().max(8),
});

/** Sets the office's prices (per suit pack, by slab), monthly minimum and GST details. */
export async function saveBillingPlan(input: z.input<typeof PlanInput>): Promise<PlatformResult> {
  const parsed = PlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the plan: a start date, the prices and the GST state code are needed." };
  const v = parsed.data;

  const slabs: { upTo: number | null; ratePaise: number }[] = [];
  for (const [i, s] of v.slabs.entries()) {
    const ratePaise = parseRupees(s.rate);
    if (ratePaise == null) return { ok: false, error: "Each price must be an amount in rupees, like 1500 or 1,500.50." };
    const last = i === v.slabs.length - 1;
    if (last) slabs.push({ upTo: null, ratePaise });
    else {
      if (!/^\d+$/.test(s.upTo)) return { ok: false, error: "Each slab except the last needs an upper number of suit packs." };
      slabs.push({ upTo: Number(s.upTo), ratePaise });
    }
  }
  if (!parseSlabs(slabs)) return { ok: false, error: "Slab limits must go up, and the last slab has no limit." };
  const minimumPaise = v.minimum === "" ? 0 : parseRupees(v.minimum);
  if (minimumPaise == null) return { ok: false, error: "The monthly minimum must be an amount in rupees." };
  if (v.gstin && !gstinValid(v.gstin)) return { ok: false, error: "This GSTIN is not valid. Check it, or leave it empty." };
  if (v.gstin && v.gstin.slice(0, 2) !== v.state) return { ok: false, error: "The GSTIN's first two digits must be the state code." };
  if (v.sac && !/^\d{4,8}$/.test(v.sac)) return { ok: false, error: "The SAC code is 4 to 8 digits." };

  const db = await createClient();
  if (!db) return { ok: false, error: "Database is not configured." };
  const { error } = await db.rpc("platform_set_billing_plan", {
    p_org: v.orgId,
    p_effective_from: v.effectiveFrom,
    p_slabs: slabs,
    p_minimum_paise: minimumPaise,
    p_recipient_gstin: v.gstin || null,
    p_recipient_state: v.state,
    p_sac_code: v.sac || null,
  });
  if (error) return { ok: false, error: error.code === "42501" ? "Only the super admin can set prices." : "Could not save the plan." };
  revalidatePath(`/dashboard/platform/${v.orgId}`);
  return { ok: true, message: "Billing plan saved." };
}

const InvoiceInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("monthly"), orgId: z.uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  z.object({
    kind: z.literal("manual"),
    orgId: z.uuid(),
    periodStart: isoDate,
    periodEnd: isoDate,
    lines: z.array(z.object({ description: z.string().trim().min(1).max(200), qty: z.string().trim().max(6), rate: rupeeText })).min(1).max(20),
  }),
]);

export type InvoiceDraft = {
  periodStart: string;
  periodEnd: string;
  suitPacks: number | null;
  lines: (InvoiceLine & { amountPaise: number })[];
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};
export type DraftResult = { ok: true; draft: InvoiceDraft } | { ok: false; error: string };

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/** Works out an invoice on the server, from the office's plan and the counted suit packs. */
async function draftInvoice(db: Db, input: z.infer<typeof InvoiceInput>): Promise<DraftResult> {
  const plans = await loadBillingPlans(db, input.orgId);
  let periodStart: string;
  let periodEnd: string;
  let lines: InvoiceLine[];
  let suitPacks: number | null = null;

  if (input.kind === "monthly") {
    ({ start: periodStart, end: periodEnd } = monthBounds(input.month));
    const plan = planOn(plans, periodStart);
    if (!plan) return { ok: false, error: "Set a billing plan for this office first (prices, GST state)." };
    const { data, error } = await db.rpc("billable_suit_packs", { org: input.orgId, p_start: periodStart, p_end: periodEnd });
    if (error) return { ok: false, error: "Could not count the suit packs." };
    suitPacks = Number(data ?? 0);
    lines = monthlyInvoiceLines({ suitPacks, slabs: plan.slabs, minimumPaise: plan.minimumPaise, month: input.month });
    if (!lines.length) return { ok: false, error: "Nothing to invoice for this month: no suit packs and no minimum." };
  } else {
    ({ periodStart, periodEnd } = input);
    if (periodEnd < periodStart) return { ok: false, error: "The period ends before it starts." };
    lines = [];
    for (const l of input.lines) {
      const ratePaise = parseRupees(l.rate);
      if (!/^\d+$/.test(l.qty) || Number(l.qty) < 1 || ratePaise == null) {
        return { ok: false, error: "Each line needs a whole quantity (1 or more) and a rate in rupees." };
      }
      lines.push({ description: l.description, qty: Number(l.qty), ratePaise });
    }
  }
  const plan = planOn(plans, periodStart);
  if (!plan) return { ok: false, error: "Set a billing plan for this office first (prices, GST state)." };
  const t = invoiceTotals(lines, SUPPLIER.state, plan.recipientState);
  return {
    ok: true,
    draft: {
      periodStart,
      periodEnd,
      suitPacks,
      lines: lines.map((l) => ({ ...l, amountPaise: l.qty * l.ratePaise })),
      taxablePaise: t.taxablePaise,
      cgstPaise: t.cgst,
      sgstPaise: t.sgst,
      igstPaise: t.igst,
      totalPaise: t.totalPaise,
    },
  };
}

/** Shows what the invoice will be, before it is issued. */
export async function previewInvoice(input: z.input<typeof InvoiceInput>): Promise<DraftResult> {
  const parsed = InvoiceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fill in the period and every line (description, quantity, rate)." };
  const db = await createClient();
  if (!db) return { ok: false, error: "Database is not configured." };
  return draftInvoice(db, parsed.data);
}

/** Issues the invoice: worked out again here, numbered by the database, then immutable. */
export async function issueInvoice(input: z.input<typeof InvoiceInput>): Promise<PlatformResult> {
  const parsed = InvoiceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fill in the period and every line (description, quantity, rate)." };
  const db = await createClient();
  if (!db) return { ok: false, error: "Database is not configured." };
  const r = await draftInvoice(db, parsed.data);
  if (!r.ok) return r;
  const d = r.draft;
  const { data, error } = await db.rpc("platform_issue_invoice", {
    p_org: parsed.data.orgId,
    p_prefix: INVOICE_PREFIX,
    p_period_start: d.periodStart,
    p_period_end: d.periodEnd,
    p_lines: d.lines,
    p_taxable_paise: d.taxablePaise,
    p_cgst_paise: d.cgstPaise,
    p_sgst_paise: d.sgstPaise,
    p_igst_paise: d.igstPaise,
    p_total_paise: d.totalPaise,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Only the super admin can issue an invoice." };
    if (error.code === "23505") return { ok: false, error: "This period already has an invoice. Cancel it first to issue a new one." };
    return { ok: false, error: "Could not issue the invoice." };
  }
  const no = (data as { invoice_no: string }[] | null)?.[0]?.invoice_no ?? "";
  revalidatePath("/dashboard/platform", "layout");
  return { ok: true, message: `Invoice ${no} issued.` };
}

const StatusInput = z.object({ id: z.uuid(), status: z.enum(["paid", "cancelled"]), paymentRef: z.string().trim().max(60).optional() });

/** Records payment (with its reference) or cancels; the database keeps this forward-only. */
export async function setInvoiceStatus(input: z.input<typeof StatusInput>): Promise<PlatformResult> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { id, status, paymentRef } = parsed.data;
  if (status === "paid" && (paymentRef ?? "").length < 3) return { ok: false, error: "Enter the payment reference (UTR / cheque no.)." };
  const db = await createClient();
  if (!db) return { ok: false, error: "Database is not configured." };
  const { error } = await db.rpc("platform_set_invoice_status", { p_id: id, p_status: status, p_payment_ref: paymentRef ?? null });
  if (error) return { ok: false, error: error.code === "42501" ? "Only the super admin can change an invoice." : "Could not change the invoice." };
  revalidatePath("/dashboard/platform", "layout");
  return { ok: true, message: status === "paid" ? "Marked paid." : "Invoice cancelled." };
}

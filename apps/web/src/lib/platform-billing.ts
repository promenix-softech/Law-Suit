import "server-only";
import { z } from "zod";
import { financialYear, parseSlabs, type InvoiceLine, type Slab } from "@civil-suits/domain";
import type { createClient } from "@/lib/supabase/server";

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export const INVOICE_PREFIX = process.env.INVOICE_PREFIX ?? "PS";

export type BillingPlan = {
  effectiveFrom: string;
  slabs: Slab[];
  minimumPaise: number;
  recipientGstin: string | null;
  recipientState: string;
  sacCode: string | null;
};

export type InvoiceRow = {
  id: string;
  orgId: string;
  officeName: string;
  invoiceNo: string;
  fy: string;
  periodStart: string;
  periodEnd: string;
  lines: (InvoiceLine & { amountPaise: number })[];
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  status: "issued" | "paid" | "cancelled";
  paidAt: string | null;
  paymentRef: string | null;
  issuedAt: string;
  /** GST details kept on the invoice when it was issued (null on invoices issued before 17 Nov). */
  recipientGstin: string | null;
  recipientState: string | null;
  sacCode: string | null;
  supplierGstin: string | null;
};

const Lines = z.array(z.object({ description: z.string(), qty: z.number().int(), ratePaise: z.number().int(), amountPaise: z.number().int() }));

/** An office's billing plans, newest first (super admin only; the function checks). */
export async function loadBillingPlans(db: Db, orgId: string): Promise<BillingPlan[]> {
  const { data } = await db.rpc("platform_billing_plans", { p_org: orgId });
  return ((data ?? []) as Record<string, unknown>[]).flatMap((p) => {
    const slabs = parseSlabs(p.slabs);
    if (!slabs) return [];
    return [
      {
        effectiveFrom: String(p.effective_from),
        slabs,
        minimumPaise: Number(p.minimum_paise),
        recipientGstin: (p.recipient_gstin as string | null) ?? null,
        recipientState: String(p.recipient_state),
        sacCode: (p.sac_code as string | null) ?? null,
      },
    ];
  });
}

/** The plan in force on a date: the latest one that started on or before it. */
export function planOn(plans: BillingPlan[], isoDate: string): BillingPlan | null {
  return plans.find((p) => p.effectiveFrom <= isoDate) ?? null;
}

/** Invoices of one office, or of all offices when orgId is null (super admin only). */
export async function loadInvoices(db: Db, orgId: string | null): Promise<InvoiceRow[]> {
  const { data } = await db.rpc("platform_invoices", { p_org: orgId });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    orgId: String(r.org_id),
    officeName: String(r.office_name),
    invoiceNo: String(r.invoice_no),
    fy: String(r.fy),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    lines: Lines.safeParse(r.lines).data ?? [],
    taxablePaise: Number(r.taxable_paise),
    cgstPaise: Number(r.cgst_paise),
    sgstPaise: Number(r.sgst_paise),
    igstPaise: Number(r.igst_paise),
    totalPaise: Number(r.total_paise),
    status: r.status as InvoiceRow["status"],
    paidAt: (r.paid_at as string | null) ?? null,
    paymentRef: (r.payment_ref as string | null) ?? null,
    issuedAt: String(r.issued_at),
    recipientGstin: (r.recipient_gstin as string | null) ?? null,
    recipientState: (r.recipient_state as string | null) ?? null,
    sacCode: (r.sac_code as string | null) ?? null,
    supplierGstin: (r.supplier_gstin as string | null) ?? null,
  }));
}

/** Totals for the console: what is unpaid, and what was invoiced and paid this financial year. */
export function invoiceSummary(rows: InvoiceRow[], now = new Date()) {
  const fy = financialYear(now.toISOString());
  const live = rows.filter((r) => r.status !== "cancelled");
  return {
    fy,
    outstandingPaise: live.filter((r) => r.status === "issued").reduce((n, r) => n + r.totalPaise, 0),
    outstandingCount: live.filter((r) => r.status === "issued").length,
    invoicedThisFyPaise: live.filter((r) => r.fy === fy).reduce((n, r) => n + r.totalPaise, 0),
    paidThisFyPaise: live.filter((r) => r.fy === fy && r.status === "paid").reduce((n, r) => n + r.totalPaise, 0),
  };
}

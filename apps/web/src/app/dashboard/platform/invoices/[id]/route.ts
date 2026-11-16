import { z } from "zod";
import { buildTaxInvoice } from "@civil-suits/templates";
import { renderDocx } from "@/lib/docx";
import { SUPPLIER } from "@/lib/billing";
import { isPlatformAdmin } from "@/lib/platform";
import { loadBillingPlans, loadInvoices, planOn } from "@/lib/platform-billing";
import { createClient } from "@/lib/supabase/server";

/** Tax invoice as DOCX for the super admin (any office). The database functions check the caller. */
export async function GET(_req: Request, ctx: RouteContext<"/dashboard/platform/invoices/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  if (!supabase) return new Response("Not configured", { status: 503 });
  if (!(await isPlatformAdmin(supabase))) return new Response("Not found", { status: 404 });

  const inv = (await loadInvoices(supabase, null)).find((r) => r.id === id);
  if (!inv) return new Response("Not found", { status: 404 });
  // The GST details kept on the invoice; only invoices issued before they were kept fall back to the plan.
  const kept = inv.recipientState != null;
  const plan = kept ? null : planOn(await loadBillingPlans(supabase, inv.orgId), inv.periodStart);
  const recipientGstin = kept ? inv.recipientGstin : (plan?.recipientGstin ?? null);
  const recipientState = (kept ? inv.recipientState : plan?.recipientState) ?? SUPPLIER.state;

  const doc = buildTaxInvoice({
    supplier: kept ? { ...SUPPLIER, gstin: inv.supplierGstin } : SUPPLIER,
    recipient: { name: inv.officeName, address: null, gstin: recipientGstin, state: recipientState },
    invoiceNo: inv.invoiceNo,
    invoiceDate: inv.issuedAt,
    period: { start: inv.periodStart, end: inv.periodEnd },
    sacCode: kept ? inv.sacCode : (plan?.sacCode ?? null),
    lines: inv.lines,
    taxablePaise: inv.taxablePaise,
    cgstPaise: inv.cgstPaise,
    sgstPaise: inv.sgstPaise,
    igstPaise: inv.igstPaise,
    totalPaise: inv.totalPaise,
  });
  const body = await renderDocx(doc);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${inv.invoiceNo.replaceAll("/", "-")}.docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

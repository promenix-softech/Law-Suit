import { z } from "zod";
import { buildTaxInvoice } from "@civil-suits/templates";
import { renderDocx } from "@/lib/docx";
import { SUPPLIER } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

const Lines = z.array(z.object({ description: z.string(), qty: z.number().int(), ratePaise: z.number().int(), amountPaise: z.number().int() }));

/** Tax invoice as DOCX. RLS limits invoices to the office's own admins. */
export async function GET(_req: Request, ctx: RouteContext<"/dashboard/billing/invoices/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  if (!supabase) return new Response("Not configured", { status: 503 });

  const { data: inv } = await supabase
    .from("invoices")
    .select("org_id, invoice_no, issued_at, period_start, period_end, lines, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, organizations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!inv) return new Response("Not found", { status: 404 });
  const lines = Lines.safeParse(inv.lines);
  if (!lines.success) return new Response("Invoice data is invalid", { status: 500 });

  const { data: plan } = await supabase
    .from("billing_plans")
    .select("recipient_gstin, recipient_state, sac_code")
    .lte("effective_from", inv.period_start)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const org = (Array.isArray(inv.organizations) ? inv.organizations[0] : inv.organizations) as { name: string } | null;

  const doc = buildTaxInvoice({
    supplier: SUPPLIER,
    recipient: { name: org?.name ?? "", address: null, gstin: plan?.recipient_gstin ?? null, state: plan?.recipient_state ?? SUPPLIER.state },
    invoiceNo: inv.invoice_no,
    invoiceDate: inv.issued_at,
    period: { start: inv.period_start, end: inv.period_end },
    sacCode: plan?.sac_code ?? null,
    lines: lines.data,
    taxablePaise: Number(inv.taxable_paise),
    cgstPaise: Number(inv.cgst_paise),
    sgstPaise: Number(inv.sgst_paise),
    igstPaise: Number(inv.igst_paise),
    totalPaise: Number(inv.total_paise),
  });
  const body = await renderDocx(doc);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${inv.invoice_no.replaceAll("/", "-")}.docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

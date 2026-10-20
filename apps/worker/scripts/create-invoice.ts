/**
 * Issues the monthly GST invoice for one office (Promenix → client). Run by Promenix with the
 * service-role key; app users cannot write invoices.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm --filter @civil-suits/worker create-invoice <org_id> <YYYY-MM> [--dry-run]
 *
 * Counts billable suit packs (one per case, first bundle in the month, IST), prices them with
 * the org's plan, adds GST and stores an immutable invoice with the next number in the FY.
 */
import { financialYear, formatINR, invoiceNumber, invoiceTotals, monthlyCharge, parseSlabs } from "@civil-suits/domain";
import { serviceClient } from "../src/supabase";

const SUPPLIER_STATE = "27"; // Maharashtra
const PREFIX = process.env.INVOICE_PREFIX ?? "PS";

const [orgId, month, flag] = process.argv.slice(2);
if (!orgId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orgId) || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
  console.error("Usage: create-invoice <org_id> <YYYY-MM> [--dry-run]");
  process.exit(1);
}
const dryRun = flag === "--dry-run";

async function main() {
  const sb = serviceClient();
  const [y, m] = month!.split("-").map(Number) as [number, number];
  const start = `${month}-01`;
  const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

  const { data: plan, error: pe } = await sb
    .from("billing_plans")
    .select("slabs, minimum_paise, recipient_state")
    .eq("org_id", orgId)
    .lte("effective_from", start)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pe || !plan) throw new Error("No billing plan effective for this month");
  const slabs = parseSlabs(plan.slabs);
  if (!slabs) throw new Error("The billing plan's slabs are malformed");

  const { data: packs, error: ce } = await sb.rpc("billable_suit_packs", { org: orgId, p_start: start, p_end: end });
  if (ce) throw new Error(`count failed: ${ce.message}`);
  const suitPacks = Number(packs ?? 0);
  const charge = monthlyCharge({ suitPacks, slabs, minimumPaise: Number(plan.minimum_paise) });

  // One line per slab used, plus the minimum top-up.
  const lines: { description: string; qty: number; ratePaise: number }[] = [];
  let from = 0;
  for (const s of slabs) {
    const to = s.upTo ?? Infinity;
    const qty = Math.max(0, Math.min(suitPacks, to) - from);
    if (qty) lines.push({ description: `Suit packs ${s.upTo ? `${from + 1}–${s.upTo}` : `${from + 1} and above`}, ${month}`, qty, ratePaise: s.ratePaise });
    from = to;
  }
  if (charge.minimumTopUpPaise) lines.push({ description: `Monthly minimum top-up, ${month}`, qty: 1, ratePaise: charge.minimumTopUpPaise });
  const totals = invoiceTotals(lines, SUPPLIER_STATE, plan.recipient_state);
  if (totals.taxablePaise !== charge.taxablePaise) throw new Error("Line items do not add up to the charge");

  const issuedAt = new Date().toISOString();
  const fy = financialYear(issuedAt);
  const { count } = await sb.from("invoices").select("id", { count: "exact", head: true }).eq("fy", fy);
  const no = invoiceNumber(PREFIX, fy, (count ?? 0) + 1);

  console.log(`${no}: ${suitPacks} packs, taxable ${formatINR(totals.taxablePaise)}, GST ${formatINR(totals.total)}, total ${formatINR(totals.totalPaise)}`);
  if (dryRun) return;

  const { error } = await sb.from("invoices").insert({
    org_id: orgId,
    invoice_no: no,
    fy,
    period_start: start,
    period_end: end,
    lines: lines.map((l) => ({ ...l, amountPaise: l.qty * l.ratePaise })),
    taxable_paise: totals.taxablePaise,
    cgst_paise: totals.cgst,
    sgst_paise: totals.sgst,
    igst_paise: totals.igst,
    total_paise: totals.totalPaise,
    issued_at: issuedAt,
  });
  if (error) throw new Error(`insert failed: ${error.message}`);
  console.log("Issued.");
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

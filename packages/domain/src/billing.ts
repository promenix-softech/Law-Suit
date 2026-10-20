import { assertPaise, type Paise } from "./money";

/**
 * SaaS billing for the advocate office (Promenix → client): suit packs priced by slab, a
 * monthly minimum, 18% GST split by place of supply. Amounts in paise, computed here only.
 * Rates and slabs come from the client's plan, not from code.
 */

const GST_RATE_BPS = 1800;
const STATE_CODE = /^(0[1-9]|[1-3][0-9])$/;

export interface GstSplit {
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  total: Paise;
}

/** Intra-state supply: CGST + SGST at half the rate each; inter-state: IGST. */
export function gstSplit(taxablePaise: Paise, supplierState: string, recipientState: string): GstSplit {
  assertPaise(taxablePaise, "taxablePaise");
  if (!STATE_CODE.test(supplierState) || !STATE_CODE.test(recipientState)) throw new RangeError("GST state code must be 01–39");
  if (supplierState === recipientState) {
    const half = Math.round((taxablePaise * GST_RATE_BPS) / 2 / 10_000);
    return { cgst: half, sgst: half, igst: 0, total: half * 2 };
  }
  const igst = Math.round((taxablePaise * GST_RATE_BPS) / 10_000);
  return { cgst: 0, sgst: 0, igst, total: igst };
}

export interface Slab {
  /** Inclusive upper bound of suit packs in this slab; null = no limit (must be last). */
  upTo: number | null;
  ratePaise: Paise;
}

/** Validates plan slabs read from the database; null when malformed. */
export function parseSlabs(v: unknown): Slab[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 10) return null;
  const out: Slab[] = [];
  let last = 0;
  for (const [i, s] of v.entries()) {
    if (typeof s !== "object" || s === null) return null;
    const { upTo, ratePaise } = s as Record<string, unknown>;
    const isLast = i === v.length - 1;
    if (!Number.isSafeInteger(ratePaise) || (ratePaise as number) < 0) return null;
    if (isLast ? upTo !== null : !Number.isInteger(upTo) || (upTo as number) <= last) return null;
    if (!isLast) last = upTo as number;
    out.push({ upTo: upTo as number | null, ratePaise: ratePaise as number });
  }
  return out;
}

export interface MonthlyChargeInput {
  suitPacks: number;
  slabs: Slab[];
  minimumPaise: Paise;
}

export interface MonthlyCharge {
  usagePaise: Paise;
  minimumTopUpPaise: Paise;
  taxablePaise: Paise;
}

/** Graduated slabs: each suit pack is priced at the slab it falls in. */
export function monthlyCharge(input: MonthlyChargeInput): MonthlyCharge {
  if (!Number.isInteger(input.suitPacks) || input.suitPacks < 0) throw new RangeError("suitPacks must be a whole number");
  assertPaise(input.minimumPaise, "minimumPaise");
  if (!input.slabs.length || input.slabs.at(-1)!.upTo !== null) throw new RangeError("The last slab must have no upper limit");
  let usage = 0;
  let from = 0;
  for (const s of input.slabs) {
    assertPaise(s.ratePaise, "ratePaise");
    const to = s.upTo ?? Infinity;
    if (to <= from) throw new RangeError("Slabs must increase");
    const n = Math.max(0, Math.min(input.suitPacks, to) - from);
    usage += n * s.ratePaise;
    from = to;
  }
  const topUp = Math.max(0, input.minimumPaise - usage);
  return { usagePaise: usage, minimumTopUpPaise: topUp, taxablePaise: usage + topUp };
}

export interface InvoiceLine {
  description: string;
  qty: number;
  ratePaise: Paise;
}

export function invoiceTotals(lines: InvoiceLine[], supplierState: string, recipientState: string) {
  const taxable = lines.reduce((sum, l) => {
    if (!Number.isInteger(l.qty) || l.qty < 0) throw new RangeError("qty must be a whole number");
    assertPaise(l.ratePaise, "ratePaise");
    return sum + l.qty * l.ratePaise;
  }, 0);
  const gst = gstSplit(taxable, supplierState, recipientState);
  return { taxablePaise: taxable, ...gst, totalPaise: taxable + gst.total };
}

/** Indian financial year (April–March) of an instant, judged in IST. */
export function financialYear(isoInstant: string): string {
  const ist = new Date(Date.parse(isoInstant) + 330 * 60_000);
  if (Number.isNaN(ist.getTime())) throw new RangeError("Invalid date");
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** GST invoice number: unique per FY, ≤ 16 characters, letters/digits with - and / only. */
export function invoiceNumber(prefix: string, fy: string, seq: number): string {
  if (!/^[A-Z0-9]{1,4}$/.test(prefix)) throw new RangeError("Prefix: 1–4 capital letters or digits");
  if (!/^\d{4}-\d{2}$/.test(fy)) throw new RangeError("FY like 2026-27");
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) throw new RangeError("seq must be 1–9999");
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN format and check character (mod-36 checksum). */
export function gstinValid(gstin: string): boolean {
  if (!GSTIN.test(gstin)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = B36.indexOf(gstin[i]!) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return B36[(36 - (sum % 36)) % 36] === gstin[14];
}

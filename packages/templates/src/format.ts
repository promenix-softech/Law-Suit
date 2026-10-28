/** Pleading date style used by the office: 2026-01-31 → "31.01.2026". */
export function formatDateDot(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) throw new RangeError(`Invalid date: ${iso}`);
  return `${d}.${m}.${y}`;
}

/** "12.00%" from basis points. */
export const pctBps = (bps: number): string => `${(bps / 100).toFixed(2)}%`;

/** "a, b and c" — party and facility lists in running text. */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Blank for the clerk to fill by hand, e.g. the suit number or the signing date. */
export const BLANK = "__________";

/**
 * Advocates' office details printed on the vakalatnama and the court-fee letter. Each office
 * keeps its own in the database; nothing real is committed to the repository.
 */
export interface OfficeProfile {
  firmName: string;
  /** e.g. "LEGAL FIRM" / "ADVOCATES & LEGAL CONSULTANTS". */
  firmTagline?: string | null;
  advocateCode?: string | null;
  sanadNo?: string | null;
  address?: string | null;
  contact?: string | null;
  email?: string | null;
  /** Advocates named in the vakalatnama, in order, e.g. "ADV. A. B. SAMPLE". */
  advocates?: string[];
  /** Office account for the bank to remit court fee and charges. */
  feeAccount?: { accountName: string; accountNo: string; accountType?: string | null; bank: string; branch?: string | null; ifsc?: string | null } | null;
  pan?: string | null;
  /** Prefix for the office's reference numbers, e.g. "INV/ABC/SD". */
  refPrefix?: string | null;
  /** Days given in the demand notice to pay (the office gives 7). */
  noticeDays?: number | null;
  /** Professional fee and expenses for the notice, in rupees, claimed from the borrower. */
  noticeFeeRupees?: number | null;
}

import { checkModelOutput, formatINR, rupees, stripInvisible } from "@civil-suits/domain";

/**
 * Loan-file fields we ask the extractor for, and how each value is validated and normalised
 * in code. The extractor only reads documents; it never computes amounts.
 *
 * Normalised storage (before encryption): date → YYYY-MM-DD, amount → integer paise,
 * rate → integer basis points, account → digits only, text → trimmed.
 */
export type FieldKind = "text" | "date" | "amount" | "rate" | "ifsc" | "account" | "months";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  description: string;
}

export const FIELDS: FieldDef[] = [
  { key: "borrower_name", label: "Borrower name", kind: "text", description: "Full name of the main borrower as written in the loan documents" },
  { key: "borrower_address", label: "Borrower address", kind: "text", description: "Residential or registered address of the main borrower" },
  { key: "guarantor_name", label: "Guarantor name", kind: "text", description: "Full name of the guarantor, if any" },
  { key: "bank_name", label: "Bank", kind: "text", description: "Name of the lending bank" },
  { key: "branch_name", label: "Branch", kind: "text", description: "Name of the bank branch that sanctioned the loan" },
  { key: "ifsc", label: "IFSC", kind: "ifsc", description: "IFSC code of the lending branch" },
  { key: "loan_account_number", label: "Loan account no.", kind: "account", description: "Loan account number" },
  { key: "facility_type", label: "Facility", kind: "text", description: "Type of loan facility, e.g. Term Loan, Cash Credit, Housing Loan" },
  { key: "sanction_date", label: "Sanction date", kind: "date", description: "Date the loan was sanctioned, as written in the sanction letter" },
  { key: "sanction_amount", label: "Sanctioned amount", kind: "amount", description: "Loan amount sanctioned, in Indian rupees" },
  { key: "interest_rate", label: "Interest rate", kind: "rate", description: "Annual rate of interest in percent" },
  { key: "npa_date", label: "NPA date", kind: "date", description: "Date the account was classified as a Non-Performing Asset" },
  { key: "outstanding_amount", label: "Outstanding", kind: "amount", description: "Total amount outstanding as per the statement of account, in Indian rupees" },
  { key: "outstanding_as_on", label: "Outstanding as on", kind: "date", description: "Date as on which the outstanding amount is stated" },
  // Suit particulars the plaint prints; the drafter still verifies each one.
  { key: "guarantor_address", label: "Guarantor address", kind: "text", description: "Residential address of the guarantor, if any" },
  { key: "loan_purpose", label: "Loan purpose", kind: "text", description: "Purpose for which the loan was sanctioned, as written in the sanction letter or agreement" },
  { key: "application_date", label: "Loan application date", kind: "date", description: "Date of the borrower's loan application, if stated" },
  { key: "tenure_months", label: "Tenure (months)", kind: "months", description: "Repayment period in months, or the number of monthly instalments" },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** JSON schema for the extractor: every field needs a type and a description. */
export function extractionSchema(): string {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const f of FIELDS) {
    properties[f.key] = {
      type: "string",
      description: `${f.description}. Copy exactly as printed; leave empty if not present.`,
    };
  }
  return JSON.stringify({ type: "object", properties });
}

export type Normalised = { ok: true; stored: string } | { ok: false; reason: string };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // e.g. 31-02
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Indian documents write day first: 31-03-2025, 31/03/2025, 31.03.2025, 31 Mar 2025, or ISO. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return isoDate(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return isoDate(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2]!.slice(0, m[2]!.toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()];
    return mon ? isoDate(+m[3]!, mon, +m[1]!) : null;
  }
  return null;
}

/** "₹2,60,000.00", "Rs. 260000/-", "2,60,000" → paise. Rejects words, negatives, >2 decimals. */
export function parseAmountPaise(raw: string): number | null {
  const s = raw
    .replace(/(rs\.?|inr|₹|\/-)/gi, "")
    .replace(/,/g, "")
    .trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const paise = rupees(Number(s));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Words a sanction letter may print around one fixed rate without changing it. */
const RATE_WORDS = new Set([
  "rate", "of", "interest", "roi", "per", "annum", "p", "a", "pa", "with", "monthly", "quarterly",
  "rests", "rest", "compounded", "compounding", "fixed", "simple", "payable", "at", "the",
]);

/**
 * "10.50%", "10.5 % p.a.", "10.75% per annum, with monthly rests" → basis points (0–50%).
 * Only one fixed rate is accepted: a second number or any other word ("MCLR", "plus", "over",
 * "penal", "for 12 months") means a floating or split rate, and a person must decide.
 */
export function parseRateBps(raw: string): number | null {
  const s = raw.trim();
  const plain = /^(\d{1,2}(?:\.\d{1,2})?)\s*%?\s*(p\.?\s*a\.?|per annum)?$/i.exec(s);
  let value = plain?.[1];
  if (!value) {
    const pct = [...s.matchAll(/(\d{1,2}(?:\.\d{1,2})?)\s*%/g)];
    if (pct.length !== 1) return null;
    const rest = s.replace(pct[0]![0], " ");
    if (/\d/.test(rest)) return null;
    const words = rest.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (!words.every((w) => RATE_WORDS.has(w))) return null;
    value = pct[0]![1];
  }
  const bps = Math.round(Number(value) * 100);
  return bps > 0 && bps <= 5000 ? bps : null;
}

/** "60", "60 months", "72 monthly instalments of Rs. 18,200/-", "84 EMIs" → months (1–480). */
export function parseMonths(raw: string): number | null {
  const m = /^(\d{1,3})(?:\s+(?:months?|monthly\b.*|equated\b.*|emis?|instal(?:l)?ments?\b.*))?$/i.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 480 ? n : null;
}

export function normalise(kind: FieldKind, raw: string): Normalised {
  // Values come from a model reading an untrusted scan: hidden characters are dropped, and
  // anything that reads like instructions or carries links is never accepted automatically.
  const s = stripInvisible(raw).trim();
  if (!s) return { ok: false, reason: "Empty" };
  const guard = checkModelOutput(s);
  if (!guard.ok) return { ok: false, reason: "Suspicious text — check the scan" };
  switch (kind) {
    case "text":
      return s.length <= 300 ? { ok: true, stored: s.replace(/\s+/g, " ") } : { ok: false, reason: "Too long" };
    case "date": {
      const d = parseDate(s);
      return d ? { ok: true, stored: d } : { ok: false, reason: "Not a valid date" };
    }
    case "amount": {
      const p = parseAmountPaise(s);
      return p != null ? { ok: true, stored: String(p) } : { ok: false, reason: "Not a valid amount" };
    }
    case "rate": {
      const r = parseRateBps(s);
      return r != null ? { ok: true, stored: String(r) } : { ok: false, reason: "Not a valid rate" };
    }
    case "ifsc": {
      const v = s.toUpperCase().replace(/\s/g, "");
      return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? { ok: true, stored: v } : { ok: false, reason: "Not a valid IFSC" };
    }
    case "account": {
      const v = s.replace(/[\s-]/g, "");
      return /^[0-9A-Z]{6,20}$/i.test(v) ? { ok: true, stored: v.toUpperCase() } : { ok: false, reason: "Not a valid account number" };
    }
    case "months": {
      const n = parseMonths(s);
      return n != null ? { ok: true, stored: String(n) } : { ok: false, reason: "Not a number of months" };
    }
  }
}

/** Human display of a normalised value. Account numbers are always masked. */
export function display(kind: FieldKind, stored: string): string {
  switch (kind) {
    case "amount":
      return formatINR(Number(stored));
    case "rate":
      return `${(Number(stored) / 100).toFixed(2)}% p.a.`;
    case "date": {
      const [y, m, d] = stored.split("-");
      return `${d}-${m}-${y}`;
    }
    case "account":
      return `XXXXXX${stored.slice(-4)}`;
    case "months":
      return `${stored} months`;
    default:
      return stored;
  }
}

/** Editable form of a stored value (what the drafter sees in the input box). */
export function editable(kind: FieldKind, stored: string): string {
  if (kind === "amount") return (Number(stored) / 100).toFixed(2);
  if (kind === "rate") return (Number(stored) / 100).toFixed(2);
  return kind === "date" ? display(kind, stored) : stored;
}

/** Below this, the drafter must look closely. */
export const LOW_CONFIDENCE = 0.85;

/** Reads a leaf confidence from extractor annotations; accepts 0–1 or 0–100 scales. */
export function confidenceOf(annotations: unknown, key: string): number | null {
  const leaf = (annotations as Record<string, unknown> | null)?.[key] as { confidence?: unknown } | undefined;
  const c = typeof leaf?.confidence === "number" ? leaf.confidence : Number(leaf?.confidence);
  if (!Number.isFinite(c)) return null;
  const v = c > 1 ? c / 100 : c;
  return Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
}

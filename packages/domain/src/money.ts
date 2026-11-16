/** All money is held as integer paise. ₹1 = 100 paise. */
export type Paise = number;

export const PAISE_PER_RUPEE = 100;

export function rupees(r: number): Paise {
  return Math.round(r * PAISE_PER_RUPEE);
}

/**
 * Parses a rupee amount typed by a person ("1,50,000", "1500.5", "₹ 25,000.00") into paise,
 * without floating point. Null when it is not a plain non-negative amount with at most 2 decimals.
 */
export function parseRupees(text: string): Paise | null {
  const s = text.replace(/[₹,\s]/g, "").replace(/^Rs\.?/i, "");
  const m = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const paise = Number(m[1]) * PAISE_PER_RUPEE + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function assertPaise(value: number, name = "amount"): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of paise`);
  }
}

const groupIndian = (rupeePart: number) => {
  const s = String(rupeePart);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest ? rest + "," : ""}${last3}`;
};

/** Pleading style used in plaints and court papers: "Rs. 14,45,310/-"; paise only when present. */
export function formatRs(paise: Paise): string {
  assertPaise(paise);
  const p = paise % 100;
  return `Rs. ${groupIndian(Math.floor(paise / 100))}${p ? `.${String(p).padStart(2, "0")}` : ""}/-`;
}

/** Indian digit grouping, e.g. 2500000 paise -> "₹25,000.00". */
export function formatINR(paise: Paise): string {
  assertPaise(paise);
  return `₹${groupIndian(Math.floor(paise / 100))}.${String(paise % 100).padStart(2, "0")}`;
}

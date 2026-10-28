/** All money is held as integer paise. ₹1 = 100 paise. */
export type Paise = number;

export const PAISE_PER_RUPEE = 100;

export function rupees(r: number): Paise {
  return Math.round(r * PAISE_PER_RUPEE);
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

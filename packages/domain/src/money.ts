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

/** Indian digit grouping, e.g. 2500000 paise -> "₹25,000.00". */
export function formatINR(paise: Paise): string {
  assertPaise(paise);
  const rupeePart = Math.floor(paise / 100);
  const p = String(paise % 100).padStart(2, "0");
  const s = String(rupeePart);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${rest ? rest + "," : ""}${last3}.${p}`;
}

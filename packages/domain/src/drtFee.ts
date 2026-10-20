import { assertPaise, rupees, type Paise } from "./money";

/** DRT jurisdiction threshold (S.O. 4312(E), 6 Sep 2018). */
export const DRT_MIN_DEBT: Paise = rupees(20_00_000);

/**
 * DRT (Procedure) Rules, 1993 fee for an Original Application:
 * ₹12,000 up to ₹10 lakh; +₹1,000 per ₹1 lakh (or part) above; max ₹1,50,000.
 */
export function drtFee(amountPaise: Paise): Paise {
  assertPaise(amountPaise, "amountPaise");
  const tenLakh = rupees(10_00_000);
  let fee = rupees(12_000);
  if (amountPaise > tenLakh) {
    fee += Math.ceil((amountPaise - tenLakh) / rupees(1_00_000)) * rupees(1_000);
  }
  return Math.min(fee, rupees(1_50_000));
}

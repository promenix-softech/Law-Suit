import { assertPaise, rupees, type Paise } from "./money";

/**
 * Maharashtra Court-fees Act, Schedule I Article 1 (ad valorem on money suits).
 *
 * From ₹1,00,000: ₹6,430, plus ₹200 per ₹10,000 (or part) up to ₹11,00,000,
 * plus ₹1,200 per ₹1,00,000 (or part) above that. The cap is configurable
 * because secondary sources disagree (₹3 lakh vs ₹10 lakh); it does not bite
 * below ₹20 lakh.
 *
 * Slabs below ₹1,00,000 are not encoded yet: they must be loaded from config
 * after verification against the statute, so we refuse rather than guess.
 */
export interface CourtFeeOptions {
  capPaise?: Paise;
}

const BASE_AT = rupees(1_00_000);
const BASE_FEE = rupees(6_430);
const MID_LIMIT = rupees(11_00_000);
const MID_STEP = rupees(10_000);
const MID_STEP_FEE = rupees(200);
const HIGH_STEP = rupees(1_00_000);
const HIGH_STEP_FEE = rupees(1_200);

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

export function maharashtraCourtFee(amountPaise: Paise, opts: CourtFeeOptions = {}): Paise {
  assertPaise(amountPaise, "amountPaise");
  if (amountPaise < BASE_AT) {
    throw new RangeError("Court-fee slabs below ₹1,00,000 are not configured yet [[LEGAL_REVIEW]]");
  }

  let fee = BASE_FEE;
  const midPart = Math.min(amountPaise, MID_LIMIT) - BASE_AT;
  fee += ceilDiv(midPart, MID_STEP) * MID_STEP_FEE;
  if (amountPaise > MID_LIMIT) {
    fee += ceilDiv(amountPaise - MID_LIMIT, HIGH_STEP) * HIGH_STEP_FEE;
  }

  if (opts.capPaise !== undefined) {
    assertPaise(opts.capPaise, "capPaise");
    fee = Math.min(fee, opts.capPaise);
  }
  return fee;
}

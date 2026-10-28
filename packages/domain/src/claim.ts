import { assertPaise, type Paise } from "./money";

/** The three heads of a bank-recovery claim, as printed in the plaint's "Particulars of claim". */
export interface ClaimHeads {
  /** A: principal outstanding plus normal interest applied up to the claim date. */
  principalInterestPaise: Paise;
  /** B: penal interest (0 prints as NIL). null = not decided yet; the office settles it later. */
  penalInterestPaise: Paise | null;
  /** C: expenses incurred (notice, legal charges) claimed in the suit. */
  expensesPaise: Paise;
}

export interface ParticularsOfClaim extends ClaimHeads {
  /** A + B + C — the suit amount used for valuation and court fee (B counted as 0 while pending). */
  totalPaise: Paise;
  /** Penal interest not decided yet: the total is provisional and the suit cannot be filed. */
  penalPending: boolean;
}

/** Totals the claim heads in code so the plaint, court fee and decree all use the same figure. */
export function particularsOfClaim(heads: ClaimHeads): ParticularsOfClaim {
  assertPaise(heads.principalInterestPaise, "principalInterestPaise");
  if (heads.penalInterestPaise !== null) assertPaise(heads.penalInterestPaise, "penalInterestPaise");
  assertPaise(heads.expensesPaise, "expensesPaise");
  const totalPaise = heads.principalInterestPaise + (heads.penalInterestPaise ?? 0) + heads.expensesPaise;
  assertPaise(totalPaise, "totalPaise");
  return { ...heads, totalPaise, penalPending: heads.penalInterestPaise === null };
}

import { assertPaise, rupees, type Paise } from "./money";

/** Commercial Courts Act: specified value threshold (principal + interest to filing). */
export const COMMERCIAL_SPECIFIED_VALUE: Paise = rupees(3_00_000);

export interface CommercialCheckInput {
  /** Principal plus interest computed up to the filing date. */
  specifiedValuePaise: Paise;
  /** Bank/financier lending is a "commercial dispute" under Sec 2(1)(c)(i). */
  lenderIsBank: boolean;
  /** Urgent interim relief sought — the only exemption from Sec 12A mediation. */
  urgentInterimRelief?: boolean;
}

export interface CommercialCheckResult {
  isCommercial: boolean;
  needs12A: boolean;
  needsStatementOfTruth: boolean;
}

export function commercialCheck(input: CommercialCheckInput): CommercialCheckResult {
  assertPaise(input.specifiedValuePaise, "specifiedValuePaise");
  const isCommercial = input.lenderIsBank && input.specifiedValuePaise >= COMMERCIAL_SPECIFIED_VALUE;
  return {
    isCommercial,
    needs12A: isCommercial && !input.urgentInterimRelief,
    needsStatementOfTruth: isCommercial,
  };
}

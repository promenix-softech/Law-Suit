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

/**
 * How the office files bank-recovery suits — an office setting, chosen by its admin.
 * "summary_suit": Order XXXVII summary suit in the civil court (the office's own practice);
 * "commercial": commercial suit with Sec 12A mediation once the specified value reaches ₹3 lakh.
 */
export type BankClaimForum = "summary_suit" | "commercial";
export type SuitKind = "ordinary" | "summary_o37" | "commercial";

export interface SuitRoute {
  suitType: SuitKind;
  isCommercial: boolean;
  needs12A: boolean;
}

/** The suit type a case gets under the office's forum setting; an ordinary suit chosen by hand stays ordinary. */
export function suitRoute(check: CommercialCheckResult, forum: BankClaimForum, current: SuitKind | null): SuitRoute {
  if (forum === "commercial") {
    if (check.isCommercial) return { suitType: "commercial", isCommercial: true, needs12A: check.needs12A };
    return { suitType: current === "commercial" || current == null ? "ordinary" : current, isCommercial: false, needs12A: false };
  }
  return { suitType: current === "ordinary" ? "ordinary" : "summary_o37", isCommercial: false, needs12A: false };
}

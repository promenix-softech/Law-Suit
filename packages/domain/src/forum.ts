import { COMMERCIAL_SPECIFIED_VALUE } from "./commercial";
import { DRT_MIN_DEBT, drtFee } from "./drtFee";
import { assertPaise, formatINR, type Paise } from "./money";

export type RecoveryForum = "civil" | "commercial" | "drt";

export interface ForumInput {
  /** Debt claimed (principal + interest to filing), in paise. */
  claimPaise: Paise;
  /** Bank or financial institution under the RDB Act, 1993. */
  lenderIsBank: boolean;
}

export interface ForumResult {
  forum: RecoveryForum;
  /** DRT application fee; null for civil/commercial courts (see maharashtraCourtFee). */
  feePaise: Paise | null;
  reason: string;
}

/**
 * Where a bank's recovery claim is filed. A bank debt of ₹20 lakh or more goes to the DRT
 * (RDB Act s.17–19, threshold S.O. 4312(E)); below that the civil court, and from ₹3 lakh the
 * commercial court (Commercial Courts Act s.2(1)(c)(i), s.12).
 */
export function recoveryForum(input: ForumInput): ForumResult {
  assertPaise(input.claimPaise, "claimPaise");
  if (input.lenderIsBank && input.claimPaise >= DRT_MIN_DEBT) {
    return {
      forum: "drt",
      feePaise: drtFee(input.claimPaise),
      reason: `Bank debt of ${formatINR(DRT_MIN_DEBT)} or more: Original Application before the DRT`,
    };
  }
  if (input.lenderIsBank && input.claimPaise >= COMMERCIAL_SPECIFIED_VALUE) {
    return { forum: "commercial", feePaise: null, reason: `Commercial dispute of ${formatINR(COMMERCIAL_SPECIFIED_VALUE)} or more` };
  }
  return { forum: "civil", feePaise: null, reason: "Civil suit" };
}

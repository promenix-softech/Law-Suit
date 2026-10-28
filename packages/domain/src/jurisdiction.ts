import { maharashtraCourtFee } from "./courtFee";
import type { Paise } from "./money";

/**
 * State-specific rules. A court belongs to a state (ISO 3166-2:IN code); its court-fee law, and
 * later its e-filing format and language, follow from that. A state is only "configured" once
 * its rules are verified against the statute — until then we return nothing rather than guess.
 */

export const STATE_NAMES = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CG: "Chhattisgarh",
  DH: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TS: "Telangana",
  TN: "Tamil Nadu",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UK: "Uttarakhand",
  WB: "West Bengal",
} as const;

export type StateCode = keyof typeof STATE_NAMES;

export const isStateCode = (v: unknown): v is StateCode => typeof v === "string" && v in STATE_NAMES;
export const stateName = (code: StateCode) => STATE_NAMES[code];

export interface CourtFeeResult {
  /** null when it cannot be computed safely. */
  feePaise: Paise | null;
  /** The statute the fee is paid under; null when the state is not configured. */
  act: string | null;
  /** Why there is no fee, for the UI. */
  note: string | null;
}

/** Court fee on a money suit in a civil/commercial court of the given state. */
export function courtFeeFor(state: StateCode, claimPaise: Paise): CourtFeeResult {
  if (state === "MH") {
    const act = "Maharashtra Court-fees Act, 1959";
    try {
      return { feePaise: maharashtraCourtFee(claimPaise), act, note: null };
    } catch (e) {
      return { feePaise: null, act, note: e instanceof Error ? e.message : String(e) };
    }
  }
  return {
    feePaise: null,
    act: null,
    note: `Court-fee rules for ${stateName(state)} are not configured yet [[LEGAL_REVIEW]]`,
  };
}

import { commercialCheck, suitRoute, type BankClaimForum, type SuitKind } from "./commercial";
import { recoveryForum, type RecoveryForum } from "./forum";
import { formatINR, type Paise } from "./money";

/**
 * Which court a new bank-recovery case goes to: the kind of court follows from the law (amount
 * and the office's forum setting), the place from the district the user picks (Pune unless
 * changed). Territorial jurisdiction is a matter of fact for the advocate, so the place is a
 * suggestion, never decided by code ([[LEGAL_REVIEW]]).
 */

/** The 36 districts of Maharashtra; renamed districts keep their old name as an alias. */
export const MAHARASHTRA_DISTRICTS: readonly { name: string; aliases?: readonly string[] }[] = [
  { name: "Ahilyanagar", aliases: ["Ahmednagar"] },
  { name: "Akola" },
  { name: "Amravati" },
  { name: "Beed" },
  { name: "Bhandara" },
  { name: "Buldhana" },
  { name: "Chandrapur" },
  { name: "Chhatrapati Sambhajinagar", aliases: ["Aurangabad"] },
  { name: "Dharashiv", aliases: ["Osmanabad"] },
  { name: "Dhule" },
  { name: "Gadchiroli" },
  { name: "Gondia" },
  { name: "Hingoli" },
  { name: "Jalgaon" },
  { name: "Jalna" },
  { name: "Kolhapur" },
  { name: "Latur" },
  { name: "Mumbai City", aliases: ["Mumbai"] },
  { name: "Mumbai Suburban" },
  { name: "Nagpur" },
  { name: "Nanded" },
  { name: "Nandurbar" },
  { name: "Nashik" },
  { name: "Palghar" },
  { name: "Parbhani" },
  { name: "Pune" },
  { name: "Raigad" },
  { name: "Ratnagiri" },
  { name: "Sangli" },
  { name: "Satara" },
  { name: "Sindhudurg" },
  { name: "Solapur" },
  { name: "Thane" },
  { name: "Wardha" },
  { name: "Washim" },
  { name: "Yavatmal" },
];

/** The office files in Pune unless the user picks another district. */
export const DEFAULT_DISTRICT = "Pune";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** True when `courtDistrict` (as typed in the office's court list) is the district `district` or one of its old names. */
export function sameDistrict(courtDistrict: string, district: string): boolean {
  const a = norm(courtDistrict);
  const entry = MAHARASHTRA_DISTRICTS.find((d) => norm(d.name) === norm(district) || d.aliases?.some((x) => norm(x) === norm(district)));
  const names = entry ? [entry.name, ...(entry.aliases ?? [])] : [district];
  return names.some((n) => norm(n) === a);
}

export interface CourtOption {
  id: string;
  name: string;
  district: string;
  courtType: RecoveryForum;
}

export interface CourtChoiceInput {
  /** The claim (outstanding with interest) in paise; null while it is not known yet. */
  claimPaise: Paise | null;
  lenderIsBank: boolean;
  urgentInterimRelief: boolean;
  /** The office's setting: Order XXXVII summary suits in the civil court, or commercial suits. */
  officeForum: BankClaimForum;
  district: string;
  /** The office's own court list (Banks & courts). */
  courts: readonly CourtOption[];
}

export interface CourtChoice {
  /** Kind of court the law points to; null while the amount is not known. */
  courtType: RecoveryForum | null;
  suitType: SuitKind | null;
  needs12A: boolean;
  /** Plain words: why this kind of court. */
  reason: string;
  /** The office's courts of that kind in the district (all its courts in the district while the amount is unknown). */
  candidates: CourtOption[];
  suggested: CourtOption | null;
  /** What the advocate still has to confirm, or what is missing. */
  notes: string[];
}

const COURT_WORD: Record<RecoveryForum, string> = { civil: "civil court", commercial: "commercial court", drt: "Debts Recovery Tribunal" };

const PLACE_NOTE =
  "[[LEGAL_REVIEW]] Place: a suit is filed where the borrower lives or works, or where the cause of action arose " +
  "(usually the lending branch) — CPC s.20. The district is the user's choice; the advocate confirms it.";
const DRT_NOTE =
  "[[LEGAL_REVIEW]] Which DRT bench hears a district is notified by the Central Government and is not encoded here; " +
  "the advocate confirms the bench.";

export function chooseCourt(input: CourtChoiceInput): CourtChoice {
  const inDistrict = input.courts.filter((c) => sameDistrict(c.district, input.district));
  const byName = (a: CourtOption, b: CourtOption) => a.name.localeCompare(b.name);

  if (input.claimPaise == null) {
    const candidates = [...inDistrict].sort(byName);
    return {
      courtType: null,
      suitType: null,
      needs12A: false,
      reason: "The kind of court follows from the amount claimed; choose a court in the district for now.",
      candidates,
      suggested: candidates.find((c) => c.courtType === "civil") ?? candidates[0] ?? null,
      notes: [PLACE_NOTE],
    };
  }

  const forum = recoveryForum({ claimPaise: input.claimPaise, lenderIsBank: input.lenderIsBank });
  const check = commercialCheck({
    specifiedValuePaise: input.claimPaise,
    lenderIsBank: input.lenderIsBank,
    urgentInterimRelief: input.urgentInterimRelief,
  });
  const route = suitRoute(check, input.officeForum, null);
  const courtType: RecoveryForum = forum.forum === "drt" ? "drt" : route.suitType === "commercial" ? "commercial" : "civil";
  const amount = formatINR(input.claimPaise);

  const reason =
    courtType === "drt"
      ? `${amount}: a bank debt of ₹20 lakh or more goes to the Debts Recovery Tribunal (RDB Act, 1993).`
      : courtType === "commercial"
        ? `${amount}: a commercial suit (₹3 lakh or more, Commercial Courts Act, 2015)${route.needs12A ? "; Sec 12A mediation comes first" : "; urgent interim relief, so no 12A mediation"}.`
        : route.suitType === "summary_o37"
          ? `${amount}: a summary suit under Order XXXVII CPC in the civil court (the office's setting).`
          : `${amount}: a civil suit.`;

  const notes: string[] = [];
  let candidates: CourtOption[];
  let suggested: CourtOption | null;
  if (courtType === "drt") {
    const drts = input.courts.filter((c) => c.courtType === "drt").sort(byName);
    candidates = drts;
    suggested = drts.find((c) => sameDistrict(c.district, input.district)) ?? null;
    notes.push(DRT_NOTE);
    if (!drts.length) notes.push("No Debts Recovery Tribunal in the office's court list — add it under Banks & courts.");
  } else {
    candidates = inDistrict.filter((c) => c.courtType === courtType).sort(byName);
    suggested = candidates[0] ?? null;
    notes.push(PLACE_NOTE);
    if (!candidates.length) {
      notes.push(`No ${COURT_WORD[courtType]} for ${input.district} in the office's court list — add it under Banks & courts, or pick another district.`);
    } else if (candidates.length > 1) {
      notes.push(
        "[[LEGAL_REVIEW]] More than one such court in the district: which one hears this amount depends on its pecuniary limits; the advocate confirms.",
      );
    }
  }
  return { courtType, suitType: courtType === "drt" ? null : route.suitType, needs12A: courtType !== "drt" && route.needs12A, reason, candidates, suggested, notes };
}

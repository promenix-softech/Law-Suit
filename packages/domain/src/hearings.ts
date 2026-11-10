/**
 * Hearing diary of a filed suit. A row is one date on the court's board: when, what it is for,
 * and (once the date has passed) what happened. Pure date logic; "today" is the IST calendar date
 * passed in by the caller. The purposes are office labels for the diary, not statutory terms.
 */

export const HEARING_PURPOSES = [
  "first_date",
  "summons",
  "written_statement",
  "issues",
  "evidence_plaintiff",
  "evidence_defendant",
  "arguments",
  "judgment",
  "interim",
  "other",
] as const;
export type HearingPurpose = (typeof HEARING_PURPOSES)[number];

/** English labels; the web app translates them. */
export const HEARING_PURPOSE_LABEL: Record<HearingPurpose, string> = {
  first_date: "First date",
  summons: "Service of summons",
  written_statement: "Written statement",
  issues: "Framing of issues",
  evidence_plaintiff: "Evidence — plaintiff",
  evidence_defendant: "Evidence — defendant",
  arguments: "Arguments",
  judgment: "Judgment / order",
  interim: "Interim application",
  other: "Other",
};

export const DISPOSALS = ["decreed", "decreed_ex_parte", "settled", "dismissed", "withdrawn", "other"] as const;
export type Disposal = (typeof DISPOSALS)[number];

export const DISPOSAL_LABEL: Record<Disposal, string> = {
  decreed: "Decreed",
  decreed_ex_parte: "Decreed ex parte",
  settled: "Settled / compromise",
  dismissed: "Dismissed",
  withdrawn: "Withdrawn",
  other: "Other",
};

export interface HearingRow {
  id: string;
  /** ISO calendar date. */
  date: string;
  purpose: HearingPurpose;
  /** What happened; null until someone records it. */
  outcome: string | null;
}

export interface HearingDiary {
  /** The next date still ahead (today counts), or null. */
  next: HearingRow | null;
  /** Dates that have passed without an outcome, oldest first: someone has to write what happened. */
  toRecord: HearingRow[];
  /** Dates with an outcome, newest first. */
  past: HearingRow[];
}

export function hearingDiary(rows: readonly HearingRow[], today: string): HearingDiary {
  const byDate = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const open = byDate.filter((r) => r.outcome == null);
  return {
    next: open.find((r) => r.date >= today) ?? null,
    toRecord: open.filter((r) => r.date < today),
    past: byDate.filter((r) => r.outcome != null).reverse(),
  };
}

/** How far ahead a court date may be entered; catches a mistyped year. */
export const HEARING_MAX_DAYS_AHEAD = 730;

export type HearingDateProblem = "before_filing" | "too_far" | "duplicate";

/** Why a new hearing date is not acceptable, or null when it is. */
export function hearingDateProblem(
  date: string,
  o: { today: string; notBefore: string; taken?: readonly string[] },
): HearingDateProblem | null {
  if (date < o.notBefore) return "before_filing";
  const ahead = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${o.today}T00:00:00Z`)) / 86_400_000);
  if (ahead > HEARING_MAX_DAYS_AHEAD) return "too_far";
  if (o.taken?.includes(date)) return "duplicate";
  return null;
}

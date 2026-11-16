/**
 * An office's scheme with Promenix: how it pays (month by month or a year in advance), how many
 * new cases that covers per month and per year, until when it is valid and what happens at the
 * limit. Everything here is arithmetic on numbers the database counts; nothing is estimated.
 *
 * Dates are calendar dates in IST as "YYYY-MM-DD" (the database works them out).
 */

export type SchemePeriod = "monthly" | "yearly";
export type OnLimit = "warn" | "block";

export type SchemeTerms = {
  schemeName: string;
  period: SchemePeriod;
  /** New cases covered per calendar month; null = no monthly limit. */
  casesPerMonth: number | null;
  /** New cases covered per scheme year; null = no yearly limit. */
  casesPerYear: number | null;
  validFrom: string;
  /** Last day the scheme is valid; null = open-ended. */
  validUntil: string | null;
  onLimit: OnLimit;
  /** AI readings per day; null = the platform's default. */
  aiJobsPerDay: number | null;
  /** People the office may have; null = no limit. */
  seats: number | null;
};

export type SchemeUsage = {
  today: string;
  /** First day of the scheme year the office is in (anniversary of validFrom). */
  yearStart: string;
  casesMonth: number;
  casesYear: number;
  users: number;
  aiJobsToday: number;
};

export type SchemePreset = Pick<SchemeTerms, "schemeName" | "period" | "casesPerMonth" | "casesPerYear"> & { key: string };

/**
 * Starting points taken from the pricing plan (docs/plan.md, E4): Office = 150 suit packs a month,
 * Scale = 500; a yearly scheme is the same paid in advance, counted over the year. Every number can
 * be changed for an office.
 */
export const SCHEME_PRESETS: readonly SchemePreset[] = [
  { key: "pilot", schemeName: "Pilot", period: "monthly", casesPerMonth: 150, casesPerYear: null },
  { key: "pay_per_case", schemeName: "Pay per case", period: "monthly", casesPerMonth: null, casesPerYear: null },
  { key: "monthly_office", schemeName: "Monthly – Office", period: "monthly", casesPerMonth: 150, casesPerYear: null },
  { key: "monthly_scale", schemeName: "Monthly – Scale", period: "monthly", casesPerMonth: 500, casesPerYear: null },
  { key: "yearly_office", schemeName: "Yearly – Office", period: "yearly", casesPerMonth: null, casesPerYear: 1800 },
  { key: "yearly_scale", schemeName: "Yearly – Scale", period: "yearly", casesPerMonth: null, casesPerYear: 6000 },
];

export type MeterState = "ok" | "near" | "over";
export type Meter = {
  used: number;
  /** null = no limit. */
  allowed: number | null;
  /** Whole percent used (can pass 100); null when there is no limit. */
  pct: number | null;
  state: MeterState;
};

/** Near from 80% of the allowance, over from 100% (an allowance of 0 is over at once). */
export function meter(used: number, allowed: number | null): Meter {
  if (allowed == null) return { used, allowed: null, pct: null, state: "ok" };
  const pct = allowed === 0 ? 100 : Math.floor((used * 100) / allowed);
  const state: MeterState = used >= allowed ? "over" : pct >= 80 ? "near" : "ok";
  return { used, allowed, pct, state };
}

const DAY_MS = 86_400_000;
const toUtc = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Whole days from one calendar date to another (negative when `to` is earlier). */
export function daysFromTo(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Last day of the scheme year that starts on `yearStart`. */
export function schemeYearEnd(yearStart: string): string {
  const d = new Date(toUtc(yearStart));
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return fromUtc(d.getTime() - DAY_MS);
}

export type Validity = "none" | "not_started" | "active" | "ending" | "expired";
/** Why a new case would be refused right now (blocking schemes only), in the order the database checks. */
export type Blocked = "not_started" | "expired" | "monthly" | "yearly" | null;

export type SchemeStatus = {
  validity: Validity;
  /** Days of validity left, today included; null when open-ended or no scheme. */
  daysLeft: number | null;
  month: Meter;
  year: Meter;
  seats: Meter;
  ai: Meter;
  blocked: Blocked;
  /** Something the super admin or the office admin should look at. */
  attention: boolean;
};

/** A scheme that ends within this many days is "ending". */
export const ENDING_SOON_DAYS = 30;

export function schemeStatus(terms: SchemeTerms | null, usage: SchemeUsage): SchemeStatus {
  const month = meter(usage.casesMonth, terms?.casesPerMonth ?? null);
  const year = meter(usage.casesYear, terms?.casesPerYear ?? null);
  const seats = meter(usage.users, terms?.seats ?? null);
  const ai = meter(usage.aiJobsToday, terms?.aiJobsPerDay ?? null);
  if (!terms) return { validity: "none", daysLeft: null, month, year, seats, ai, blocked: null, attention: false };

  const daysLeft = terms.validUntil == null ? null : daysFromTo(usage.today, terms.validUntil) + 1;
  const validity: Validity =
    usage.today < terms.validFrom
      ? "not_started"
      : daysLeft != null && daysLeft <= 0
        ? "expired"
        : daysLeft != null && daysLeft <= ENDING_SOON_DAYS
          ? "ending"
          : "active";

  const wouldBlock: Blocked =
    validity === "not_started" ? "not_started" : validity === "expired" ? "expired" : month.state === "over" ? "monthly" : year.state === "over" ? "yearly" : null;
  const blocked = terms.onLimit === "block" ? wouldBlock : null;
  const attention = validity === "expired" || validity === "ending" || [month, year, seats, ai].some((m) => m.state !== "ok");
  return { validity, daysLeft: daysLeft == null ? null : Math.max(daysLeft, 0), month, year, seats, ai, blocked, attention };
}

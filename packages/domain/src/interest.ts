import { assertPaise, type Paise } from "./money";

export type Compounding = "simple" | "monthly" | "quarterly" | "half_yearly" | "yearly";

export interface InterestInput {
  principalPaise: Paise;
  /** Annual rate in basis points, e.g. 1050 = 10.50% p.a. (avoids float rates). */
  rateBps: number;
  /** ISO dates (YYYY-MM-DD). Interest runs from `from` (exclusive) to `to` (inclusive). */
  from: string;
  to: string;
  compounding: Compounding;
}

export interface InterestResult {
  days: number;
  interestPaise: Paise;
  totalPaise: Paise;
}

const DAY_MS = 86_400_000;
const PERIODS_PER_YEAR: Record<Exclude<Compounding, "simple">, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
};

function parseISODate(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new RangeError(`Invalid date: ${s}`);
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) throw new RangeError(`Invalid date: ${s}`);
  return t;
}

/**
 * Actual/365 day count, as is common in Indian bank statements.
 * Compound interest is approximated on a day basis: (1 + r/n)^(n·days/365).
 * The exact method must follow each sanction letter — keep it configurable.
 */
export function calculateInterest(input: InterestInput): InterestResult {
  assertPaise(input.principalPaise, "principalPaise");
  if (!Number.isInteger(input.rateBps) || input.rateBps < 0) {
    throw new RangeError("rateBps must be a non-negative integer");
  }
  const days = Math.round((parseISODate(input.to) - parseISODate(input.from)) / DAY_MS);
  if (days < 0) throw new RangeError("`to` must not be before `from`");

  const r = input.rateBps / 10_000;
  const years = days / 365;
  let interest: number;
  if (input.compounding === "simple") {
    interest = input.principalPaise * r * years;
  } else {
    const n = PERIODS_PER_YEAR[input.compounding];
    interest = input.principalPaise * (Math.pow(1 + r / n, n * years) - 1);
  }
  const interestPaise = Math.round(interest);
  return { days, interestPaise, totalPaise: input.principalPaise + interestPaise };
}

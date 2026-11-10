import { CASE_STATUSES, type CaseStatus } from "./lifecycle";

/**
 * Deadline watch for the dashboard. Pure date arithmetic on ISO calendar dates (IST "today" is
 * passed in by the caller). These are reminders for the office, not legal advice:
 *
 * - limitation: a conservative WATCH date, three years from the estimated default. Default is
 *   estimated as NPA date − 90 days (RBI IRAC: an account becomes NPA after 90 days overdue).
 *   A written acknowledgement (Limitation Act s.18) or a part-payment (s.19) made while the
 *   period was still running starts a fresh three years from its date; see limitationWatch().
 *   The real start of limitation and the effect of each event is for the advocate to confirm —
 *   [[LEGAL_REVIEW]].
 * - hearing / hearing_record: the next court date of a filed suit, and passed dates nobody has
 *   written up.
 * - mediation_12a: Commercial Courts Act s.12A(3) — mediation to be completed within three months
 *   of the application (extendable by two months with consent).
 * - notice_period: the payment period given in the demand notice (office practice, default 15 days).
 * - approval: office target of two days for an approver to decide.
 */

export type DeadlineKind = "limitation" | "mediation_12a" | "notice_period" | "approval" | "hearing" | "hearing_record";

export interface Deadline {
  kind: DeadlineKind;
  /** ISO date. */
  due: string;
  /** Negative when overdue. */
  daysLeft: number;
  tone: "red" | "amber";
}

export interface DeadlineInput {
  /** Today's date in IST, ISO. */
  today: string;
  status: CaseStatus;
  npaDate?: string | null;
  noticeSentOn?: string | null;
  noticePaymentDays?: number;
  /** Application date of a 12A mediation that is still pending. */
  mediationAppliedOn?: string | null;
  /** When the oldest draft of the case went to the approver. */
  approvalWaitingSince?: string | null;
  /** Acknowledgements and part-payments recorded for the case. */
  limitationEvents?: readonly LimitationEvent[];
  /** Next court date still ahead, for a filed suit. */
  nextHearingOn?: string | null;
  /** Oldest court date that has passed without an outcome. */
  hearingToRecordOn?: string | null;
}

export type LimitationEventKind = "acknowledgment" | "part_payment";
export interface LimitationEvent {
  kind: LimitationEventKind;
  /** ISO date the acknowledgement was signed or the payment made. */
  on: string;
}

export interface LimitationWatch {
  /** Estimated default (NPA date − 90 days): where the first three years start. */
  base: string;
  /** The watch date after the events that count. */
  due: string;
  /** Events made while the period was running: each restarted the three years. */
  counted: LimitationEvent[];
  /** Events made after the period had already run out: they do not revive it. */
  late: LimitationEvent[];
}

const DAY_MS = 86_400_000;
const LIMITATION_YEARS = 3;
const NPA_OVERDUE_DAYS = 90;
const LIMITATION_WARN_DAYS = 180;
const URGENT_DAYS = 30;
const APPROVAL_TARGET_DAYS = 2;

function parse(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new RangeError(`Invalid date: ${s}`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${s}`);
  return d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysISO(date: string, days: number): string {
  return iso(new Date(parse(date).getTime() + days * DAY_MS));
}

/** Calendar months; the day is clamped to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsISO(date: string, months: number): string {
  const d = parse(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return iso(target);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS);
}

/** Conservative limitation watch date: three years from (NPA date − 90 days). */
export function limitationWatchDate(npaDate: string): string {
  return addMonthsISO(addDaysISO(npaDate, -NPA_OVERDUE_DAYS), LIMITATION_YEARS * 12);
}

/**
 * Limitation watch with acknowledgements and part-payments. Events are taken in date order; one
 * made on or before the watch date then running (and not before the default) moves the watch date
 * to three years from the event. One made after the period had run out is reported as `late` and
 * changes nothing. A watch date for the office, not a legal opinion — [[LEGAL_REVIEW]].
 */
export function limitationWatch(npaDate: string, events: readonly LimitationEvent[] = []): LimitationWatch {
  const base = addDaysISO(npaDate, -NPA_OVERDUE_DAYS);
  let due = addMonthsISO(base, LIMITATION_YEARS * 12);
  const counted: LimitationEvent[] = [];
  const late: LimitationEvent[] = [];
  for (const e of [...events].sort((a, b) => a.on.localeCompare(b.on))) {
    parse(e.on);
    if (e.on < base) continue;
    if (e.on > due) {
      late.push(e);
      continue;
    }
    counted.push(e);
    const fresh = addMonthsISO(e.on, LIMITATION_YEARS * 12);
    if (fresh > due) due = fresh;
  }
  return { base, due, counted, late };
}

const FILED_INDEX = CASE_STATUSES.indexOf("filed");
const HEARING_WARN_DAYS = 7;
const HEARING_URGENT_DAYS = 1;

export function caseDeadlines(i: DeadlineInput): Deadline[] {
  const out: Deadline[] = [];
  const at = (kind: DeadlineKind, due: string, tone: (daysLeft: number) => Deadline["tone"] | null) => {
    const daysLeft = daysBetween(i.today, due);
    const t = tone(daysLeft);
    if (t) out.push({ kind, due, daysLeft, tone: t });
  };

  if (i.npaDate && CASE_STATUSES.indexOf(i.status) < FILED_INDEX) {
    at("limitation", limitationWatch(i.npaDate, i.limitationEvents).due, (d) =>
      d <= URGENT_DAYS ? "red" : d <= LIMITATION_WARN_DAYS ? "amber" : null,
    );
  }
  if (i.status === "mediation_12a" && i.mediationAppliedOn) {
    at("mediation_12a", addMonthsISO(i.mediationAppliedOn, 3), (d) => (d < 0 ? "red" : d <= URGENT_DAYS ? "amber" : null));
  }
  if (i.status === "notice_sent" && i.noticeSentOn) {
    at("notice_period", addDaysISO(i.noticeSentOn, i.noticePaymentDays ?? 15), (d) => (d < 0 ? "amber" : null));
  }
  if (i.status === "filed" || i.status === "listed") {
    if (i.hearingToRecordOn) at("hearing_record", i.hearingToRecordOn, () => "red");
    if (i.nextHearingOn) {
      at("hearing", i.nextHearingOn, (d) => (d <= HEARING_URGENT_DAYS ? "red" : d <= HEARING_WARN_DAYS ? "amber" : null));
    }
  }
  if (i.approvalWaitingSince) {
    at("approval", addDaysISO(i.approvalWaitingSince, APPROVAL_TARGET_DAYS), (d) => (d < 0 ? "amber" : null));
  }

  return out.sort((a, b) => (a.tone === b.tone ? a.daysLeft - b.daysLeft : a.tone === "red" ? -1 : 1));
}

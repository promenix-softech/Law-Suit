/** Shared display helpers for statuses (labels + pill colour classes from globals.css). */
import type { T } from "./i18n";

const CASE: Record<string, [label: string, tone: string]> = {
  bank_call: ["Bank call", "pill-neutral"],
  case_created: ["Case created", "pill-neutral"],
  docs_uploaded: ["Docs uploaded", "pill-neutral"],
  extraction_review: ["Extraction review", "pill-violet"],
  notice_generated: ["Notice generated", "pill-violet"],
  notice_sent: ["Notice sent", "pill-violet"],
  mediation_12a: ["12A mediation", "pill-amber"],
  drafting: ["Drafting", "pill-violet"],
  in_approval: ["In approval", "pill-amber"],
  approved: ["Approved", "pill-green"],
  notary_stamp: ["Notary / stamp", "pill-green"],
  efiling_ready: ["E-filing ready", "pill-green"],
  filed: ["Filed", "pill-green"],
  listed: ["Listed", "pill-green"],
  disposed: ["Disposed", "pill-neutral"],
};

const DRAFT: Record<string, [label: string, tone: string]> = {
  draft: ["Draft", "pill-neutral"],
  in_approval: ["Awaiting approval", "pill-amber"],
  returned: ["Returned", "pill-red"],
  approved: ["Approved", "pill-green"],
};

const localise = ([label, tone]: [string, string], t?: T): [string, string] => [t ? t(label) : label, tone];

export const caseStatus = (s: string, t?: T) => localise(CASE[s] ?? [s.replaceAll("_", " "), "pill-neutral"], t);
export const draftStatus = (s: string, t?: T) => localise(DRAFT[s] ?? [s, "pill-neutral"], t);

export const fmtDate = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })
    : "—";

/** Today's calendar date in IST, as YYYY-MM-DD. */
export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export const title = (s: string) => s.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

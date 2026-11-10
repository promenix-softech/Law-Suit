/**
 * "What now?" for a case: the single next step and a readiness checklist, worked out in code from
 * the case's facts (no AI). Shown at the top of the case page so nobody has to guess which button
 * comes next, and so finished steps read as finished.
 */

import type { CaseStatus } from "@civil-suits/domain";

export type CaseFacts = {
  status: CaseStatus;
  archived: boolean;
  needs12A: boolean;
  isDrt: boolean;
  scans: number;
  /** An OCR or extraction job is queued or running. */
  readingNow: boolean;
  extracted: number;
  unverified: number;
  noticeDrafted: boolean;
  noticeSent: boolean;
  mediation: "none" | "pending" | "failed" | "settled";
  /** Missing suit particulars, by label ("Penal interest", "Signatory", …). */
  missing: string[];
  papers: { expected: number; generated: number; draft: number; returned: number; inApproval: number; approved: number };
  plaintApproved: boolean;
  bundleBuilt: boolean;
  /** The court's CNR is recorded (after filing). */
  hasCnr: boolean;
  /** Next court date still ahead (ISO), for a filed suit. */
  nextHearing: string | null;
  /** Court dates that have passed without a note of what happened. */
  hearingsToRecord: number;
  canEdit: boolean;
  /** Papers in approval this user may decide (not their own). */
  awaitingMe: number;
};

export type Who = "you" | "approver" | "drafter" | "field" | "nobody";
export type Step = {
  id: string;
  /** English UI text; the page translates it. `count` is shown after the title when set. */
  title: string;
  count?: number;
  detail?: string;
  /** An ISO date the page shows after the title (the next hearing). */
  date?: string;
  anchor: string;
  who: Who;
  tone: "action" | "wait" | "done";
};

const doIt = (f: CaseFacts, s: Omit<Step, "who" | "tone">): Step =>
  f.canEdit ? { ...s, who: "you", tone: "action" } : { ...s, who: "drafter", tone: "wait" };

export function nextStep(f: CaseFacts): Step {
  if (f.archived) return { id: "archived", title: "Case archived — restore it to work on it", anchor: "archive", who: "nobody", tone: "wait" };
  if (f.status === "disposed") return { id: "disposed", title: "Case disposed", anchor: "hearings", who: "nobody", tone: "done" };
  if (f.status === "filed" || f.status === "listed") {
    if (!f.hasCnr) return doIt(f, { id: "cnr", title: "Add the CNR and filing number when the court registers the suit", anchor: "filing" });
    if (f.hearingsToRecord > 0) {
      return doIt(f, { id: "hearing-record", title: "Write what happened at the hearing", count: f.hearingsToRecord, anchor: "hearings" });
    }
    if (!f.nextHearing) return doIt(f, { id: "hearing-add", title: "Add the next hearing date", anchor: "hearings" });
    return { id: "hearing-wait", title: "Next hearing", date: f.nextHearing, anchor: "hearings", who: "nobody", tone: "wait" };
  }
  if (f.status === "notary_stamp") return doIt(f, { id: "efiling-ready", title: "Mark the case ready for e-filing", anchor: "filing" });
  if (f.status === "efiling_ready") return doIt(f, { id: "record-filing", title: "Record the filing: e-filing number, date and court fee", anchor: "filing" });
  // An approved case is past intake, whatever its scans look like: on to the bundle and the notary.
  if (f.status === "approved") {
    return f.bundleBuilt
      ? doIt(f, { id: "notary", title: "Notary and stamp, then mark it done", anchor: "filing" })
      : doIt(f, { id: "bundle", title: "Build the e-filing bundle", anchor: "bundle" });
  }
  if (f.scans === 0) return doIt(f, { id: "upload", title: "Upload the bank's loan file", anchor: "documents" });
  if (f.readingNow) return { id: "reading", title: "AI is reading the scans — about a minute", anchor: "documents", who: "nobody", tone: "wait" };
  if (f.extracted === 0) return doIt(f, { id: "read", title: "Read the scans with AI", anchor: "documents" });
  if (f.unverified > 0) return doIt(f, { id: "verify", title: "Check and verify the extracted values", count: f.unverified, anchor: "extraction" });
  if (!f.noticeSent) {
    if (!f.noticeDrafted) return doIt(f, { id: "notice", title: "Generate the demand notice", anchor: "drafts" });
    return doIt(f, { id: "dispatch", title: "Send the demand notice and record the dispatch", anchor: "notice" });
  }
  if (f.needs12A) {
    if (f.mediation === "none") return doIt(f, { id: "12a", title: "Apply for Sec 12A pre-institution mediation", anchor: "mediation" });
    if (f.mediation === "pending") return doIt(f, { id: "12a-outcome", title: "Record the mediation outcome and report", anchor: "mediation" });
    if (f.mediation === "settled") return { id: "settled", title: "Settled in mediation — no suit needed", anchor: "mediation", who: "nobody", tone: "done" };
  }
  if (f.missing.length) {
    return doIt(f, { id: "particulars", title: "Complete the suit particulars", detail: f.missing.join(", "), anchor: "particulars" });
  }
  const p = f.papers;
  const missingPapers = Math.max(0, p.expected - p.generated);
  if (missingPapers > 0) return doIt(f, { id: "papers", title: "Generate the suit papers", count: missingPapers, anchor: "drafts" });
  if (p.returned > 0) return doIt(f, { id: "returned", title: "Fix the papers the approver returned", count: p.returned, anchor: "drafts" });
  if (p.draft > 0) return doIt(f, { id: "submit", title: "Send the papers for approval", count: p.draft, anchor: "drafts" });
  if (p.inApproval > 0) {
    return f.awaitingMe > 0
      ? { id: "review", title: "Review and approve the papers", count: f.awaitingMe, anchor: "drafts", who: "you", tone: "action" }
      : { id: "with-approver", title: "With the approver", count: p.inApproval, anchor: "drafts", who: "approver", tone: "wait" };
  }
  if (f.plaintApproved && !f.bundleBuilt) return doIt(f, { id: "bundle", title: "Build the e-filing bundle", anchor: "bundle" });
  if (f.bundleBuilt) return doIt(f, { id: "notary", title: "Notary and stamp, then mark it done", anchor: "filing" });
  return { id: "done", title: "Everything is up to date", anchor: "summary", who: "nobody", tone: "done" };
}

/**
 * A short "what comes next" for a case list, from the stage alone (the case page works out the
 * exact step from the case's facts). English UI text; the page translates it.
 */
export const STATUS_NEXT: Record<CaseStatus, string> = {
  bank_call: "Open the case",
  case_created: "Upload the bank's loan file",
  docs_uploaded: "Read the scans with AI",
  extraction_review: "Check and verify the extracted values",
  notice_generated: "Send the demand notice",
  notice_sent: "Prepare the suit papers",
  mediation_12a: "Record the mediation outcome",
  drafting: "Finish the papers and send them for approval",
  in_approval: "With the approver",
  approved: "Build the e-filing bundle, then notary",
  notary_stamp: "Mark the case ready for e-filing",
  efiling_ready: "Record the filing",
  filed: "Add the CNR and the first hearing date",
  listed: "Add the next hearing date",
  disposed: "Case disposed",
};

export type CheckItem = { label: string; done: boolean; anchor: string };

/** The milestones of a suit, ticked as they are reached. */
export function checklist(f: CaseFacts): CheckItem[] {
  const p = f.papers;
  const items: CheckItem[] = [
    { label: "Loan file uploaded", done: f.scans > 0, anchor: "documents" },
    { label: "Values verified", done: f.extracted > 0 && f.unverified === 0, anchor: "extraction" },
    { label: "Demand notice sent", done: f.noticeSent, anchor: "notice" },
  ];
  if (f.needs12A) items.push({ label: "Sec 12A mediation", done: f.mediation === "failed" || f.mediation === "settled", anchor: "mediation" });
  if (!f.isDrt) items.push({ label: "Suit particulars", done: f.missing.length === 0, anchor: "particulars" });
  items.push(
    { label: "Papers generated", done: p.expected > 0 && p.generated >= p.expected, anchor: "drafts" },
    { label: "Papers approved", done: p.expected > 0 && p.approved >= p.expected, anchor: "drafts" },
    { label: "E-filing bundle", done: f.bundleBuilt, anchor: "bundle" },
    { label: "Filed", done: ["filed", "listed", "disposed"].includes(f.status), anchor: "filing" },
    { label: "CNR", done: f.hasCnr, anchor: "filing" },
    { label: "Hearing date", done: f.status === "listed" || f.status === "disposed", anchor: "hearings" },
  );
  return items;
}

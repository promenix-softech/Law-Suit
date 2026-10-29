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
  anchor: string;
  who: Who;
  tone: "action" | "wait" | "done";
};

const doIt = (f: CaseFacts, s: Omit<Step, "who" | "tone">): Step =>
  f.canEdit ? { ...s, who: "you", tone: "action" } : { ...s, who: "drafter", tone: "wait" };

export function nextStep(f: CaseFacts): Step {
  if (f.archived) return { id: "archived", title: "Case archived — restore it to work on it", anchor: "archive", who: "nobody", tone: "wait" };
  if (f.status === "filed" || f.status === "listed" || f.status === "disposed") {
    return { id: "filed", title: "Suit filed — track hearings", anchor: "summary", who: "nobody", tone: "done" };
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
  if (f.bundleBuilt) return doIt(f, { id: "file", title: "Notary, stamp and e-file — assign the field tasks", anchor: "tasks" });
  return { id: "done", title: "Everything is up to date", anchor: "summary", who: "nobody", tone: "done" };
}

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
  );
  return items;
}

/**
 * The approvals page: who has to do what with each paper that is in approval or was sent back.
 * Pure sorting and grouping — the rows come from the database under RLS, and the database alone
 * decides whether an approval is allowed (maker–checker). This only decides what to show where.
 */

export type InboxPaper = {
  id: string;
  caseId: string;
  caseNo: string;
  borrower: string;
  docKind: string;
  language: string;
  status: "in_approval" | "returned";
  /** The draft's author and everyone who wrote one of its versions: none of them may approve it. */
  makers: string[];
  version: number;
  /** What the latest version changed, in the drafter's words; null for a freshly generated paper. */
  note: string | null;
  /** When the paper was sent (in approval) or sent back (returned). */
  since: string;
  assignedApprover: string | null;
  /** The latest decision on the paper, if any. */
  last: { decision: "approved" | "returned"; comments: string | null; by: string; at: string } | null;
};

export type CaseGroup = {
  caseId: string;
  caseNo: string;
  borrower: string;
  assignedToMe: boolean;
  /** The oldest paper of the case decides how long the case has waited. */
  since: string;
  papers: InboxPaper[];
};

export type Inbox = {
  /** In approval, and I may decide them. One group per case: a suit set arrives together. */
  toDecide: CaseGroup[];
  /** Mine, sent back with comments: I have to fix them and send them again. */
  returnedToMe: InboxPaper[];
  /** Mine, with the approver. */
  myWaiting: InboxPaper[];
  /** Sent back by me and still with the drafter. */
  returnedByMe: InboxPaper[];
};

/** The order in which a suit set is read. Papers not listed come last, by name. */
const READING_ORDER = [
  "demand_notice",
  "mediation_application",
  "plaint",
  "original_application",
  "interim_application",
  "list_of_documents",
  "affidavit",
  "statement_of_truth",
  "vakalatnama",
  "address_memo",
  "bbe_certificate",
  "draft_decree",
  "court_fee_letter",
  "efiling_sheet",
];
const rank = (kind: string) => {
  const i = READING_ORDER.indexOf(kind);
  return i < 0 ? READING_ORDER.length : i;
};
const byReadingOrder = (a: InboxPaper, b: InboxPaper) =>
  rank(a.docKind) - rank(b.docKind) || a.docKind.localeCompare(b.docKind) || a.language.localeCompare(b.language);
const oldestFirst = (a: { since: string }, b: { since: string }) => a.since.localeCompare(b.since);

export function buildInbox(papers: InboxPaper[], me: string, canApprove: boolean): Inbox {
  const mine = (p: InboxPaper) => p.makers.includes(me);
  const groups = new Map<string, CaseGroup>();
  if (canApprove) {
    for (const p of papers) {
      if (p.status !== "in_approval" || mine(p)) continue;
      const g = groups.get(p.caseId) ?? {
        caseId: p.caseId,
        caseNo: p.caseNo,
        borrower: p.borrower,
        assignedToMe: p.assignedApprover === me,
        since: p.since,
        papers: [],
      };
      g.papers.push(p);
      if (p.since < g.since) g.since = p.since;
      groups.set(p.caseId, g);
    }
  }
  const toDecide = [...groups.values()]
    .map((g) => ({ ...g, papers: [...g.papers].sort(byReadingOrder) }))
    // My own cases first, then whoever has waited longest.
    .sort((a, b) => Number(b.assignedToMe) - Number(a.assignedToMe) || oldestFirst(a, b));

  return {
    toDecide,
    returnedToMe: papers.filter((p) => p.status === "returned" && mine(p)).sort(oldestFirst),
    myWaiting: papers.filter((p) => p.status === "in_approval" && mine(p)).sort(oldestFirst),
    returnedByMe: papers.filter((p) => p.status === "returned" && !mine(p) && p.last?.decision === "returned" && p.last.by === me).sort(oldestFirst),
  };
}

/** Whole days between two moments, never negative. */
export function daysBetween(fromIso: string, to: Date): number {
  const ms = to.getTime() - Date.parse(fromIso);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

/** How urgent a wait looks: amber after two days (as on the dashboard), red after five. */
export function waitTone(days: number): "pill-neutral" | "pill-amber" | "pill-red" {
  return days >= 5 ? "pill-red" : days >= 2 ? "pill-amber" : "pill-neutral";
}

/** The number on the navigation link: what is waiting for this person to act. */
export function inboxCount(inbox: Inbox): number {
  return inbox.toDecide.reduce((n, g) => n + g.papers.length, 0) + inbox.returnedToMe.length;
}

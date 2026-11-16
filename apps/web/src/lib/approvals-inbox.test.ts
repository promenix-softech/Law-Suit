import { describe, expect, it } from "vitest";
import { buildInbox, daysBetween, inboxCount, waitTone, type InboxPaper } from "./approvals-inbox";

const ME = "approver-1";
const DRAFTER = "drafter-1";

const paper = (over: Partial<InboxPaper>): InboxPaper => ({
  id: "p1",
  caseId: "c1",
  caseNo: "DEMO-2026-0001",
  borrower: "Ramesh Demo Patil",
  docKind: "plaint",
  language: "en",
  status: "in_approval",
  makers: [DRAFTER],
  version: 1,
  note: null,
  since: "2026-11-10T10:00:00Z",
  assignedApprover: ME,
  last: null,
  ...over,
});

describe("buildInbox", () => {
  it("groups the papers of a suit set under their case, in reading order", () => {
    const inbox = buildInbox(
      [
        paper({ id: "a", docKind: "vakalatnama" }),
        paper({ id: "b", docKind: "plaint" }),
        paper({ id: "c", docKind: "demand_notice", language: "mr" }),
        paper({ id: "d", docKind: "demand_notice", language: "en" }),
      ],
      ME,
      true,
    );
    expect(inbox.toDecide).toHaveLength(1);
    expect(inbox.toDecide[0].papers.map((p) => p.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("never offers a paper to someone who wrote it or one of its versions", () => {
    const papers = [paper({ id: "own", makers: [ME] }), paper({ id: "edited", makers: [DRAFTER, ME] }), paper({ id: "other" })];
    const inbox = buildInbox(papers, ME, true);
    expect(inbox.toDecide.flatMap((g) => g.papers.map((p) => p.id))).toEqual(["other"]);
    expect(inbox.myWaiting.map((p) => p.id)).toEqual(["own", "edited"]);
  });

  it("gives a drafter nothing to decide", () => {
    const inbox = buildInbox([paper({ makers: ["someone-else"] })], DRAFTER, false);
    expect(inbox.toDecide).toEqual([]);
  });

  it("puts my own cases first, then the longest wait", () => {
    const inbox = buildInbox(
      [
        paper({ id: "x", caseId: "other-old", assignedApprover: "approver-2", since: "2026-11-01T00:00:00Z" }),
        paper({ id: "y", caseId: "mine-new", since: "2026-11-12T00:00:00Z" }),
        paper({ id: "z", caseId: "mine-old", since: "2026-11-05T00:00:00Z" }),
      ],
      ME,
      true,
    );
    expect(inbox.toDecide.map((g) => g.caseId)).toEqual(["mine-old", "mine-new", "other-old"]);
    expect(inbox.toDecide[0].assignedToMe).toBe(true);
    expect(inbox.toDecide[2].assignedToMe).toBe(false);
  });

  it("a case has waited as long as its oldest paper", () => {
    const inbox = buildInbox([paper({ id: "a", since: "2026-11-12T00:00:00Z" }), paper({ id: "b", docKind: "affidavit", since: "2026-11-08T00:00:00Z" })], ME, true);
    expect(inbox.toDecide[0].since).toBe("2026-11-08T00:00:00Z");
  });

  it("shows the drafter what came back and what is still with the approver", () => {
    const back = paper({ id: "back", status: "returned", last: { decision: "returned", comments: "Fix the rate", by: ME, at: "2026-11-11T00:00:00Z" } });
    const waiting = paper({ id: "waiting" });
    const asDrafter = buildInbox([back, waiting], DRAFTER, false);
    expect(asDrafter.returnedToMe.map((p) => p.id)).toEqual(["back"]);
    expect(asDrafter.myWaiting.map((p) => p.id)).toEqual(["waiting"]);

    const asApprover = buildInbox([back, waiting], ME, true);
    expect(asApprover.returnedByMe.map((p) => p.id)).toEqual(["back"]);
    expect(asApprover.returnedToMe).toEqual([]);
  });

  it("counts what waits for me: papers to decide and papers sent back to me", () => {
    const back = paper({ id: "back", status: "returned", makers: [ME], last: { decision: "returned", comments: "x", by: "approver-2", at: "2026-11-11T00:00:00Z" } });
    const inbox = buildInbox([paper({ id: "a" }), paper({ id: "b", docKind: "affidavit" }), back, paper({ id: "own", makers: [ME] })], ME, true);
    expect(inboxCount(inbox)).toBe(3);
  });
});

describe("waiting time", () => {
  it("counts whole days, never below zero", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(daysBetween("2026-11-15T09:00:00Z", now)).toBe(0);
    expect(daysBetween("2026-11-13T11:00:00Z", now)).toBe(2);
    expect(daysBetween("2026-11-20T00:00:00Z", now)).toBe(0);
    expect(daysBetween("not a date", now)).toBe(0);
  });

  it("turns amber after two days and red after five", () => {
    expect([0, 1, 2, 4, 5, 30].map(waitTone)).toEqual(["pill-neutral", "pill-neutral", "pill-amber", "pill-amber", "pill-red", "pill-red"]);
  });
});

import { describe, expect, it } from "vitest";
import { checklist, nextStep, type CaseFacts } from "./next-step";

const base: CaseFacts = {
  status: "drafting",
  archived: false,
  needs12A: false,
  isDrt: false,
  scans: 1,
  readingNow: false,
  extracted: 12,
  unverified: 0,
  noticeDrafted: true,
  noticeSent: true,
  mediation: "none",
  missing: [],
  papers: { expected: 9, generated: 9, draft: 0, returned: 0, inApproval: 0, approved: 9 },
  plaintApproved: true,
  bundleBuilt: false,
  hasCnr: false,
  nextHearing: null,
  hearingsToRecord: 0,
  canEdit: true,
  awaitingMe: 0,
};
const f = (over: Partial<CaseFacts>): CaseFacts => ({ ...base, ...over });
const papers = (over: Partial<CaseFacts["papers"]>) => ({ ...base.papers, ...over });

describe("nextStep", () => {
  it("walks a case from upload to the bundle in order", () => {
    expect(nextStep(f({ scans: 0 })).id).toBe("upload");
    expect(nextStep(f({ readingNow: true })).id).toBe("reading");
    expect(nextStep(f({ extracted: 0 })).id).toBe("read");
    expect(nextStep(f({ unverified: 3 }))).toMatchObject({ id: "verify", count: 3, anchor: "extraction" });
    expect(nextStep(f({ noticeSent: false, noticeDrafted: false })).id).toBe("notice");
    expect(nextStep(f({ noticeSent: false })).id).toBe("dispatch");
    expect(nextStep(f({ missing: ["Penal interest"] }))).toMatchObject({ id: "particulars", detail: "Penal interest" });
    expect(nextStep(f({ papers: papers({ generated: 6, approved: 0 }) }))).toMatchObject({ id: "papers", count: 3 });
    expect(nextStep(f({ papers: papers({ returned: 1, approved: 8 }) })).id).toBe("returned");
    expect(nextStep(f({ papers: papers({ draft: 9, approved: 0 }) }))).toMatchObject({ id: "submit", count: 9 });
    expect(nextStep(f({})).id).toBe("bundle");
    expect(nextStep(f({ bundleBuilt: true })).id).toBe("notary");
  });

  it("walks the filing steps after approval up to the CNR", () => {
    expect(nextStep(f({ status: "notary_stamp", bundleBuilt: true })).id).toBe("efiling-ready");
    expect(nextStep(f({ status: "efiling_ready", bundleBuilt: true })).id).toBe("record-filing");
    expect(nextStep(f({ status: "filed", bundleBuilt: true }))).toMatchObject({ id: "cnr", anchor: "filing" });
    expect(nextStep(f({ status: "filed", bundleBuilt: true, hasCnr: true }))).toMatchObject({ id: "hearing-add", anchor: "hearings" });
  });

  it("keeps the hearing diary going until the suit is disposed", () => {
    const court = { status: "listed" as const, hasCnr: true };
    expect(nextStep(f({ ...court, nextHearing: "2026-12-01" }))).toMatchObject({ id: "hearing-wait", date: "2026-12-01", tone: "wait" });
    expect(nextStep(f({ ...court, nextHearing: "2026-12-01", hearingsToRecord: 1 }))).toMatchObject({ id: "hearing-record", count: 1 });
    expect(nextStep(f({ ...court })).id).toBe("hearing-add");
    expect(nextStep(f({ ...court, canEdit: false }))).toMatchObject({ id: "hearing-add", who: "drafter", tone: "wait" });
    expect(nextStep(f({ status: "disposed", hasCnr: true, hearingsToRecord: 2 }))).toMatchObject({ id: "disposed", tone: "done" });
  });

  it("asks for 12A mediation only when the suit needs it", () => {
    expect(nextStep(f({ needs12A: true })).id).toBe("12a");
    expect(nextStep(f({ needs12A: true, mediation: "pending" })).id).toBe("12a-outcome");
    expect(nextStep(f({ needs12A: true, mediation: "settled" })).tone).toBe("done");
    expect(nextStep(f({ needs12A: true, mediation: "failed" })).id).toBe("bundle");
  });

  it("tells people without edit rights who is on it", () => {
    expect(nextStep(f({ canEdit: false, scans: 0 }))).toMatchObject({ who: "drafter", tone: "wait" });
    expect(nextStep(f({ papers: papers({ inApproval: 2, approved: 7 }) }))).toMatchObject({ id: "with-approver", who: "approver" });
    expect(nextStep(f({ canEdit: false, awaitingMe: 2, papers: papers({ inApproval: 2, approved: 7 }) }))).toMatchObject({
      id: "review",
      who: "you",
      tone: "action",
    });
  });

  it("stops at archived and filed cases", () => {
    expect(nextStep(f({ archived: true, scans: 0 })).id).toBe("archived");
    expect(nextStep(f({ status: "disposed", hasCnr: true })).tone).toBe("done");
  });
});

describe("checklist", () => {
  it("ticks reached milestones and adds 12A only when needed", () => {
    const items = checklist(f({}));
    expect(items.map((i) => i.done)).toEqual([true, true, true, true, true, true, false, false, false, false]);
    expect(checklist(f({ needs12A: true })).some((i) => i.label === "Sec 12A mediation")).toBe(true);
    expect(checklist(f({ isDrt: true })).some((i) => i.label === "Suit particulars")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { addDaysISO, addMonthsISO, caseDeadlines, daysBetween, limitationWatchDate } from "./deadlines";

describe("date helpers", () => {
  it("adds days and months on calendar dates", () => {
    expect(addDaysISO("2026-01-30", 3)).toBe("2026-02-02");
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsISO("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-25", "2026-11-04")).toBe(10);
    expect(daysBetween("2026-10-25", "2026-10-20")).toBe(-5);
  });
});

describe("limitationWatchDate", () => {
  it("is three years from the estimated default (NPA date minus 90 days)", () => {
    expect(limitationWatchDate("2025-03-31")).toBe("2027-12-31");
  });
});

describe("caseDeadlines", () => {
  const base = { today: "2026-10-25", status: "drafting" as const };

  it("returns nothing for a calm case", () => {
    expect(caseDeadlines({ ...base, npaDate: "2026-01-01" })).toEqual([]);
  });

  it("warns 180 days before the limitation watch date and turns red within 30", () => {
    // NPA 2024-07-28 → default ≈ 2024-04-29 → watch date 2027-04-29 (186 days away): quiet.
    expect(caseDeadlines({ ...base, npaDate: "2024-07-28" })).toEqual([]);
    const amber = caseDeadlines({ ...base, npaDate: "2024-07-20" });
    expect(amber).toEqual([{ kind: "limitation", due: "2027-04-21", daysLeft: 178, tone: "amber" }]);
    const red = caseDeadlines({ ...base, npaDate: "2024-01-20" });
    expect(red[0]).toMatchObject({ kind: "limitation", due: "2026-10-22", daysLeft: -3, tone: "red" });
  });

  it("stops watching limitation once the suit is filed", () => {
    expect(caseDeadlines({ ...base, status: "filed", npaDate: "2023-01-01" })).toEqual([]);
  });

  it("flags a pending 12A mediation near the end of its three months", () => {
    const d = caseDeadlines({ ...base, status: "mediation_12a", mediationAppliedOn: "2026-08-10" });
    expect(d).toEqual([{ kind: "mediation_12a", due: "2026-11-10", daysLeft: 16, tone: "amber" }]);
    const late = caseDeadlines({ ...base, status: "mediation_12a", mediationAppliedOn: "2026-07-01" });
    expect(late[0]).toMatchObject({ kind: "mediation_12a", tone: "red" });
    expect(caseDeadlines({ ...base, status: "mediation_12a", mediationAppliedOn: "2026-10-01" })).toEqual([]);
  });

  it("says when the notice period is over and the next step can start", () => {
    const d = caseDeadlines({ ...base, status: "notice_sent", noticeSentOn: "2026-10-05", noticePaymentDays: 15 });
    expect(d).toEqual([{ kind: "notice_period", due: "2026-10-20", daysLeft: -5, tone: "amber" }]);
    expect(caseDeadlines({ ...base, status: "notice_sent", noticeSentOn: "2026-10-20", noticePaymentDays: 15 })).toEqual([]);
  });

  it("flags drafts waiting more than two days for approval", () => {
    expect(caseDeadlines({ ...base, status: "in_approval", approvalWaitingSince: "2026-10-24" })).toEqual([]);
    expect(caseDeadlines({ ...base, status: "in_approval", approvalWaitingSince: "2026-10-21" })).toEqual([
      { kind: "approval", due: "2026-10-23", daysLeft: -2, tone: "amber" },
    ]);
  });

  it("sorts red before amber, then the earliest due first", () => {
    const d = caseDeadlines({
      ...base,
      status: "in_approval",
      npaDate: "2024-01-20",
      approvalWaitingSince: "2026-10-01",
    });
    expect(d.map((x) => x.kind)).toEqual(["limitation", "approval"]);
  });
});

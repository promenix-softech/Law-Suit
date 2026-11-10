import { describe, expect, it } from "vitest";
import { DISPOSALS, DISPOSAL_LABEL, HEARING_PURPOSES, HEARING_PURPOSE_LABEL, hearingDateProblem, hearingDiary, type HearingRow } from "./hearings";

const row = (id: string, date: string, outcome: string | null = null): HearingRow => ({ id, date, purpose: "other", outcome });

describe("hearingDiary", () => {
  it("is empty for a suit with no dates", () => {
    expect(hearingDiary([], "2026-11-09")).toEqual({ next: null, toRecord: [], past: [] });
  });

  it("picks the nearest date ahead; today still counts as ahead", () => {
    const d = hearingDiary([row("b", "2026-12-01"), row("a", "2026-11-09"), row("c", "2027-01-05")], "2026-11-09");
    expect(d.next?.id).toBe("a");
    expect(d.toRecord).toEqual([]);
  });

  it("lists passed dates without an outcome, oldest first", () => {
    const d = hearingDiary([row("b", "2026-11-01"), row("a", "2026-10-01"), row("c", "2026-12-01")], "2026-11-09");
    expect(d.toRecord.map((r) => r.id)).toEqual(["a", "b"]);
    expect(d.next?.id).toBe("c");
  });

  it("keeps recorded dates as history, newest first, and never as next", () => {
    const d = hearingDiary([row("a", "2026-10-01", "Summons issued"), row("b", "2026-11-01", "Adjourned")], "2026-10-15");
    expect(d.past.map((r) => r.id)).toEqual(["b", "a"]);
    expect(d.next).toBeNull();
    expect(d.toRecord).toEqual([]);
  });
});

describe("hearingDateProblem", () => {
  const o = { today: "2026-11-09", notBefore: "2026-10-01", taken: ["2026-12-01"] };

  it("accepts a date between filing and two years ahead", () => {
    expect(hearingDateProblem("2026-11-20", o)).toBeNull();
    expect(hearingDateProblem("2026-10-01", o)).toBeNull();
    expect(hearingDateProblem("2028-11-08", o)).toBeNull();
  });

  it("refuses a date before the filing, a mistyped year and a date already on the diary", () => {
    expect(hearingDateProblem("2026-09-30", o)).toBe("before_filing");
    expect(hearingDateProblem("2029-11-20", o)).toBe("too_far");
    expect(hearingDateProblem("2026-12-01", o)).toBe("duplicate");
  });
});

describe("labels", () => {
  it("has a label for every purpose and disposal", () => {
    HEARING_PURPOSES.forEach((p) => expect(HEARING_PURPOSE_LABEL[p]).toBeTruthy());
    DISPOSALS.forEach((d) => expect(DISPOSAL_LABEL[d]).toBeTruthy());
  });
});

import { describe, expect, it } from "vitest";
import { daysFromTo, meter, SCHEME_PRESETS, schemeStatus, schemeYearEnd, type SchemeTerms, type SchemeUsage } from "./scheme";

const terms = (over: Partial<SchemeTerms> = {}): SchemeTerms => ({
  schemeName: "Monthly – Office",
  period: "monthly",
  casesPerMonth: 150,
  casesPerYear: null,
  validFrom: "2026-04-01",
  validUntil: null,
  onLimit: "warn",
  aiJobsPerDay: null,
  seats: null,
  ...over,
});
const usage = (over: Partial<SchemeUsage> = {}): SchemeUsage => ({
  today: "2026-11-16",
  yearStart: "2026-04-01",
  casesMonth: 10,
  casesYear: 400,
  users: 5,
  aiJobsToday: 3,
  ...over,
});

describe("meter", () => {
  it("has no percentage without a limit", () => {
    expect(meter(999, null)).toEqual({ used: 999, allowed: null, pct: null, state: "ok" });
  });

  it("is near from 80% and over from 100%", () => {
    expect(meter(119, 150).state).toBe("ok");
    expect(meter(120, 150)).toMatchObject({ pct: 80, state: "near" });
    expect(meter(149, 150).state).toBe("near");
    expect(meter(150, 150)).toMatchObject({ pct: 100, state: "over" });
    expect(meter(180, 150)).toMatchObject({ pct: 120, state: "over" });
  });

  it("an allowance of zero is over at once", () => {
    expect(meter(0, 0)).toMatchObject({ pct: 100, state: "over" });
  });
});

describe("dates", () => {
  it("counts days between calendar dates", () => {
    expect(daysFromTo("2026-11-16", "2026-11-16")).toBe(0);
    expect(daysFromTo("2026-11-16", "2026-12-16")).toBe(30);
    expect(daysFromTo("2026-11-16", "2026-11-01")).toBe(-15);
  });

  it("a scheme year ends the day before its anniversary", () => {
    expect(schemeYearEnd("2026-04-01")).toBe("2027-03-31");
    expect(schemeYearEnd("2026-11-16")).toBe("2027-11-15");
    expect(schemeYearEnd("2024-02-29")).toBe("2025-02-28");
  });
});

describe("schemeStatus", () => {
  it("an office without a scheme has no limits and nothing to look at", () => {
    const s = schemeStatus(null, usage({ casesMonth: 9999 }));
    expect(s).toMatchObject({ validity: "none", blocked: null, attention: false, daysLeft: null });
    expect(s.month.allowed).toBeNull();
  });

  it("is active with room to spare", () => {
    expect(schemeStatus(terms(), usage())).toMatchObject({ validity: "active", blocked: null, attention: false, daysLeft: null });
  });

  it("warns near the monthly allowance but refuses nothing", () => {
    const s = schemeStatus(terms(), usage({ casesMonth: 130 }));
    expect(s.month.state).toBe("near");
    expect(s).toMatchObject({ blocked: null, attention: true });
  });

  it("a warning scheme over its limit still refuses nothing", () => {
    const s = schemeStatus(terms(), usage({ casesMonth: 150 }));
    expect(s.month.state).toBe("over");
    expect(s.blocked).toBeNull();
  });

  it("a blocking scheme refuses new cases at the monthly limit", () => {
    expect(schemeStatus(terms({ onLimit: "block" }), usage({ casesMonth: 150 })).blocked).toBe("monthly");
  });

  it("and at the yearly limit", () => {
    const yearly = terms({ period: "yearly", casesPerMonth: null, casesPerYear: 1800, onLimit: "block" });
    expect(schemeStatus(yearly, usage({ casesYear: 1799 })).blocked).toBeNull();
    expect(schemeStatus(yearly, usage({ casesYear: 1800 })).blocked).toBe("yearly");
  });

  it("counts the last valid day as a day left, then expires", () => {
    const lastDay = schemeStatus(terms({ validUntil: "2026-11-16" }), usage());
    expect(lastDay).toMatchObject({ validity: "ending", daysLeft: 1 });
    const after = schemeStatus(terms({ validUntil: "2026-11-15", onLimit: "block" }), usage());
    expect(after).toMatchObject({ validity: "expired", daysLeft: 0, blocked: "expired", attention: true });
  });

  it("an expired scheme that only warns refuses nothing", () => {
    expect(schemeStatus(terms({ validUntil: "2026-11-15" }), usage())).toMatchObject({ validity: "expired", blocked: null, attention: true });
  });

  it("says when the end is within thirty days", () => {
    expect(schemeStatus(terms({ validUntil: "2026-12-15" }), usage())).toMatchObject({ validity: "ending", daysLeft: 30 });
    expect(schemeStatus(terms({ validUntil: "2026-12-16" }), usage())).toMatchObject({ validity: "active", daysLeft: 31 });
  });

  it("a scheme that has not started blocks only if it blocks", () => {
    expect(schemeStatus(terms({ validFrom: "2026-12-01" }), usage())).toMatchObject({ validity: "not_started", blocked: null });
    expect(schemeStatus(terms({ validFrom: "2026-12-01", onLimit: "block" }), usage()).blocked).toBe("not_started");
  });

  it("flags seats and the AI cap when they are used up", () => {
    const s = schemeStatus(terms({ seats: 5, aiJobsPerDay: 100 }), usage({ users: 5, aiJobsToday: 20 }));
    expect(s.seats.state).toBe("over");
    expect(s.ai.state).toBe("ok");
    expect(s.attention).toBe(true);
  });
});

describe("presets", () => {
  it("follow the pricing plan: Office 150 a month, Scale 500, yearly is twelve months of the same", () => {
    const by = Object.fromEntries(SCHEME_PRESETS.map((p) => [p.key, p]));
    expect(by.monthly_office).toMatchObject({ period: "monthly", casesPerMonth: 150 });
    expect(by.monthly_scale).toMatchObject({ period: "monthly", casesPerMonth: 500 });
    expect(by.yearly_office).toMatchObject({ period: "yearly", casesPerYear: 150 * 12 });
    expect(by.yearly_scale).toMatchObject({ period: "yearly", casesPerYear: 500 * 12 });
    expect(new Set(SCHEME_PRESETS.map((p) => p.key)).size).toBe(SCHEME_PRESETS.length);
  });
});

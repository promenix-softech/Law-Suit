import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { maharashtraCourtFee } from "@civil-suits/domain";
import { toPlainText } from "./model";
import { buildPlaint, type PlaintInput } from "./plaint";

const plaintFixture: PlaintInput = {
  court: { name: "Civil Judge Senior Division", place: "Pune" },
  year: 2026,
  suitType: "commercial",
  bank: { name: "State Bank of India", branch: "Demo Branch, Pune" },
  defendants: [
    { name: "Vijay Sample Jadhav", role: "borrower", address: "Synthetic address, Pune" },
    { name: "Asha Fake Jadhav", role: "guarantor", address: null },
  ],
  loan: {
    facilityType: "Term Loan",
    accountLast4: "4002",
    sanctionDate: "2023-06-15",
    sanctionAmountPaise: 26_000_000,
    rateBps: 1050,
    npaDate: "2025-03-31",
  },
  claimPaise: 30_550_652,
  claimAsOn: "2026-10-20",
  courtFeePaise: maharashtraCourtFee(30_550_652),
  courtFeeAct: "Maharashtra Court-fees Act",
  notice: { date: "2026-10-20" },
  mediation: { reportDate: "2026-12-15", outcome: "non_starter" },
  filingDate: "2026-12-20",
};

const text = (over: Partial<PlaintInput> = {}) => toPlainText(buildPlaint({ ...plaintFixture, ...over }));

describe("buildPlaint", () => {
  it("matches the golden text (commercial suit)", () => {
    const golden = readFileSync(new URL("./__golden__/plaint.commercial.en.txt", import.meta.url), "utf8");
    expect(text()).toBe(golden);
  });

  it("states the court fee computed in code", () => {
    // ₹3,05,506.52: ₹10,430 at ₹3 lakh + ₹200 for the part-step above it.
    expect(text()).toContain("Court fee of ₹10,630.00");
  });

  it("carries the Order XXXVII inscription only for summary suits", () => {
    const o37 = "(Under Order XXXVII of the Code of Civil Procedure, 1908)";
    expect(text({ suitType: "summary_o37" })).toContain(o37);
    expect(text({ suitType: "summary_o37" })).toContain("SPECIAL CIVIL SUIT NO.");
    expect(text()).not.toContain(o37);
  });

  it("commercial: pleads 12A compliance, statement of truth", () => {
    expect(text()).toContain("Section 12A");
    expect(text()).toContain("STATEMENT OF TRUTH");
    expect(text({ suitType: "ordinary" })).toContain("VERIFICATION");
    expect(text({ suitType: "ordinary" })).not.toContain("Section 12A");
  });

  it("flags a commercial plaint without a 12A report", () => {
    expect(text({ mediation: null })).toContain("must not be filed without it");
  });

  it("flags court fee when the slab is unverified", () => {
    expect(text({ courtFeePaise: null })).toContain("[[LEGAL_REVIEW]] slab to be verified");
  });

  it("never names Maharashtra law for a court in a state that is not configured", () => {
    const t = text({ courtFeePaise: null, courtFeeAct: null });
    expect(t).not.toContain("Maharashtra");
    expect(t).toContain("[[LEGAL_REVIEW]] court-fee rules for this State to be configured");
  });

  it("numbers paragraphs consecutively", () => {
    const nums = buildPlaint(plaintFixture)
      .blocks.flatMap((b) => (b.kind === "para" ? [/^(\d+)\. /.exec(b.text)?.[1]] : []))
      .filter(Boolean)
      .map(Number);
    expect(nums.length).toBeGreaterThan(5);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it("requires a defendant", () => {
    expect(() => buildPlaint({ ...plaintFixture, defendants: [] })).toThrow();
  });
});

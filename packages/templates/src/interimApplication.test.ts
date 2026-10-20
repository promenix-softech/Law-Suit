import { rupees } from "@civil-suits/domain";
import { describe, expect, it } from "vitest";
import type { CaptionInput } from "./caption";
import { buildInterimApplication } from "./interimApplication";
import { toPlainText } from "./model";

const base: CaptionInput = {
  court: { name: "Commercial Court", place: "Pune" },
  year: 2026,
  suitType: "commercial",
  bank: { name: "State Bank of India", branch: "Demo Branch, Pune" },
  defendants: [{ name: "Vijay Sample Jadhav", role: "borrower", address: null }],
};

describe("buildInterimApplication", () => {
  const t = toPlainText(buildInterimApplication({ ...base, claimPaise: rupees(8_90_000), filingDate: "2026-10-22" }));

  it("is filed in the commercial suit and cites the claim from code", () => {
    expect(t).toContain("INTERIM APPLICATION NO. ________ OF 2026");
    expect(t).toContain("COMMERCIAL SUIT NO. ________ OF 2026");
    expect(t).toContain("₹8,90,000.00");
  });

  it("flags the provision, grounds, 12A statement and verification", () => {
    expect(t.match(/\[\[LEGAL_REVIEW\]\]/g)!.length).toBeGreaterThanOrEqual(7);
    expect(t).toMatch(/\[\[LEGAL_REVIEW\]\] \d+\. Statement that the suit contemplates urgent interim relief/);
  });

  it("refuses a non-commercial suit", () => {
    expect(() => buildInterimApplication({ ...base, suitType: "ordinary", claimPaise: 1, filingDate: "2026-10-22" })).toThrow();
  });
});

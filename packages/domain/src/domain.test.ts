import { describe, expect, it } from "vitest";
import {
  calculateInterest,
  canTransition,
  commercialCheck,
  drtFee,
  efilingFileName,
  EFILING_MAX_FILENAME,
  formatINR,
  maharashtraCourtFee,
  rupees,
} from "./index";

describe("maharashtraCourtFee", () => {
  it.each([
    [1_00_000, 6_430],
    [2_00_000, 8_430],
    [3_00_000, 10_430],
    [5_00_000, 14_430],
    [10_00_000, 24_430],
    [11_00_000, 26_430],
    [12_00_000, 27_630],
    [15_00_000, 31_230],
    [20_00_000, 37_230],
  ])("₹%i → ₹%i", (amount, fee) => {
    expect(maharashtraCourtFee(rupees(amount))).toBe(rupees(fee));
  });

  it("charges a full step for a part step", () => {
    expect(maharashtraCourtFee(rupees(1_00_001))).toBe(rupees(6_630));
    expect(maharashtraCourtFee(rupees(11_00_001))).toBe(rupees(27_630));
  });

  it("applies a configured cap", () => {
    expect(maharashtraCourtFee(rupees(20_00_000), { capPaise: rupees(30_000) })).toBe(rupees(30_000));
  });

  it("refuses unverified slabs below ₹1 lakh", () => {
    expect(() => maharashtraCourtFee(rupees(50_000))).toThrow(/LEGAL_REVIEW/);
  });

  it("rejects non-integer paise", () => {
    expect(() => maharashtraCourtFee(1.5)).toThrow(RangeError);
  });
});

describe("commercialCheck", () => {
  it("bank claim ≥ ₹3 lakh is commercial and needs 12A", () => {
    expect(commercialCheck({ specifiedValuePaise: rupees(3_00_000), lenderIsBank: true })).toEqual({
      isCommercial: true,
      needs12A: true,
      needsStatementOfTruth: true,
    });
  });
  it("urgent interim relief skips 12A", () => {
    const r = commercialCheck({ specifiedValuePaise: rupees(5_00_000), lenderIsBank: true, urgentInterimRelief: true });
    expect(r.isCommercial).toBe(true);
    expect(r.needs12A).toBe(false);
  });
  it("below threshold is an ordinary suit", () => {
    expect(commercialCheck({ specifiedValuePaise: rupees(2_99_999), lenderIsBank: true }).isCommercial).toBe(false);
  });
});

describe("drtFee", () => {
  it.each([
    [20_00_000, 22_000],
    [10_00_000, 12_000],
    [10_00_001, 13_000],
    [5_00_00_000, 1_50_000],
  ])("₹%i → ₹%i", (amount, fee) => {
    expect(drtFee(rupees(amount))).toBe(rupees(fee));
  });
});

describe("calculateInterest", () => {
  it("simple interest for one year", () => {
    const r = calculateInterest({
      principalPaise: rupees(1_00_000),
      rateBps: 1000,
      from: "2025-01-01",
      to: "2026-01-01",
      compounding: "simple",
    });
    expect(r.days).toBe(365);
    expect(r.interestPaise).toBe(rupees(10_000));
  });
  it("monthly compounding exceeds simple", () => {
    const r = calculateInterest({
      principalPaise: rupees(1_00_000),
      rateBps: 1200,
      from: "2025-01-01",
      to: "2026-01-01",
      compounding: "monthly",
    });
    expect(r.interestPaise).toBe(1_268_250); // 1,00,000 × (1.01^12 − 1) ≈ ₹12,682.50
  });
  it("rejects reversed dates", () => {
    expect(() =>
      calculateInterest({ principalPaise: 100, rateBps: 100, from: "2026-01-02", to: "2026-01-01", compounding: "simple" }),
    ).toThrow();
  });
});

describe("efilingFileName", () => {
  it("builds a compliant name", () => {
    expect(efilingFileName("CS/2026/0042", "plaint")).toBe("CS_2026_0042_PLAINT_01.pdf");
  });
  it("never exceeds 45 chars and stays ASCII", () => {
    const name = efilingFileName("दावा SBI Pune Branch Special Civil Suit Number 2026 000123456", "statement_of_truth", 12);
    expect(name.length).toBeLessThanOrEqual(EFILING_MAX_FILENAME);
    expect(name).toMatch(/^[A-Z0-9_-]+_SOT_12\.pdf$/);
  });
});

describe("formatINR", () => {
  it("uses Indian grouping", () => {
    expect(formatINR(rupees(24_430))).toBe("₹24,430.00");
    expect(formatINR(rupees(12_34_567.5))).toBe("₹12,34,567.50");
  });
});

describe("canTransition", () => {
  it("blocks skipping 12A mediation when needed", () => {
    expect(canTransition("notice_sent", "drafting")).toBe(true);
    expect(canTransition("notice_sent", "drafting", { needs12A: true })).toBe(false);
    expect(canTransition("notice_sent", "mediation_12a", { needs12A: true })).toBe(true);
  });
  it("approval can return to drafting", () => {
    expect(canTransition("in_approval", "drafting")).toBe(true);
    expect(canTransition("drafting", "filed")).toBe(false);
  });
});

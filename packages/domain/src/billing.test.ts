import { describe, expect, it } from "vitest";
import { financialYear, gstinValid, gstSplit, invoiceNumber, monthlyCharge, invoiceTotals, parseSlabs } from "./billing";
import { rupees } from "./money";

describe("gstSplit", () => {
  it("charges CGST + SGST 9% each inside Maharashtra", () => {
    expect(gstSplit(rupees(1_00_000), "27", "27")).toEqual({ cgst: rupees(9_000), sgst: rupees(9_000), igst: 0, total: rupees(18_000) });
  });
  it("charges IGST 18% across states", () => {
    expect(gstSplit(rupees(1_00_000), "27", "29")).toEqual({ cgst: 0, sgst: 0, igst: rupees(18_000), total: rupees(18_000) });
  });
  it("rounds each half to the paisa so CGST = SGST", () => {
    const s = gstSplit(1_001, "27", "27"); // ₹10.01 → 9% = 90.09 paise
    expect(s.cgst).toBe(90);
    expect(s.sgst).toBe(90);
    expect(s.total).toBe(180);
  });
  it("rejects bad state codes", () => {
    expect(() => gstSplit(100, "27", "99")).toThrow();
  });
});

describe("monthlyCharge", () => {
  const slabs = [
    { upTo: 100, ratePaise: rupees(1_500) },
    { upTo: 300, ratePaise: rupees(1_000) },
    { upTo: null, ratePaise: rupees(600) },
  ];
  it("prices suit packs by slab (graduated)", () => {
    // 100 × 1500 + 200 × 1000 + 50 × 600
    expect(monthlyCharge({ suitPacks: 350, slabs, minimumPaise: 0 }).usagePaise).toBe(rupees(3_80_000));
  });
  it("tops up to the monthly minimum", () => {
    const c = monthlyCharge({ suitPacks: 20, slabs, minimumPaise: rupees(1_00_000) });
    expect(c.usagePaise).toBe(rupees(30_000));
    expect(c.minimumTopUpPaise).toBe(rupees(70_000));
    expect(c.taxablePaise).toBe(rupees(1_00_000));
  });
  it("needs an open-ended last slab", () => {
    expect(() => monthlyCharge({ suitPacks: 1, slabs: [{ upTo: 10, ratePaise: 1 }], minimumPaise: 0 })).toThrow();
  });
});

describe("parseSlabs", () => {
  it("accepts increasing slabs ending open", () => {
    expect(parseSlabs([{ upTo: 100, ratePaise: 150000 }, { upTo: null, ratePaise: 60000 }])).toHaveLength(2);
  });
  it.each([
    [[]],
    [[{ upTo: 100, ratePaise: 1 }]],
    [[{ upTo: 100, ratePaise: 1 }, { upTo: 50, ratePaise: 1 }, { upTo: null, ratePaise: 1 }]],
    [[{ upTo: null, ratePaise: -1 }]],
    [[{ upTo: null, ratePaise: 1.5 }]],
    ["x"],
  ])("rejects %j", (v) => {
    expect(parseSlabs(v)).toBeNull();
  });
});

describe("invoiceTotals", () => {
  it("adds GST on the taxable value", () => {
    const t = invoiceTotals([{ description: "Suit packs", qty: 2, ratePaise: rupees(1_500) }], "27", "27");
    expect(t).toMatchObject({ taxablePaise: rupees(3_000), cgst: rupees(270), sgst: rupees(270), igst: 0, totalPaise: rupees(3_540) });
  });
});

describe("financialYear / invoiceNumber", () => {
  it("runs April to March in IST", () => {
    expect(financialYear("2026-03-31T18:29:00Z")).toBe("2025-26"); // 23:59 IST, 31 Mar
    expect(financialYear("2026-03-31T18:31:00Z")).toBe("2026-27"); // 00:01 IST, 1 Apr
  });
  it("is unique per FY and at most 16 characters", () => {
    const n = invoiceNumber("PS", "2026-27", 42);
    expect(n).toBe("PS/2026-27/0042");
    expect(n.length).toBeLessThanOrEqual(16);
  });
});

describe("gstinValid", () => {
  it("accepts a correct checksum and rejects a typo", () => {
    expect(gstinValid("27AAPFU0939F1ZV")).toBe(true);
    expect(gstinValid("27AAPFU0939F1ZW")).toBe(false);
    expect(gstinValid("27AAPFU0939F1Z")).toBe(false);
  });
});

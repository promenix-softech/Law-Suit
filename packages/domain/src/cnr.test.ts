import { describe, expect, it } from "vitest";
import { normaliseCnr, parseCnr } from "./cnr";

describe("CNR", () => {
  it("splits a valid CNR into its parts", () => {
    expect(parseCnr("MHPU010012342026", 2027)).toEqual({ state: "MH", district: "PU", establishment: "01", serial: "001234", year: 2026 });
  });
  it("accepts what people type: lower case, spaces and hyphens", () => {
    expect(normaliseCnr("mhpu01-001234 2026")).toBe("MHPU010012342026");
    expect(parseCnr("mhpu01-001234-2026", 2027)?.year).toBe(2026);
  });
  it("refuses wrong lengths, shapes and impossible years", () => {
    for (const bad of ["", "MHPU01001234202", "MHPU0100123420261", "MH1U010012342026", "MHPUA10012342026", "MHPU010012341899", "MHPU010012342030"]) {
      expect(parseCnr(bad, 2027)).toBeNull();
    }
  });
});

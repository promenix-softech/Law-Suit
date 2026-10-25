import { describe, expect, it } from "vitest";
import { courtFeeFor, isStateCode, stateName } from "./jurisdiction";
import { maharashtraCourtFee } from "./courtFee";
import { rupees } from "./money";

describe("states", () => {
  it("knows Indian state codes", () => {
    expect(stateName("MH")).toBe("Maharashtra");
    expect(stateName("MP")).toBe("Madhya Pradesh");
    expect(isStateCode("MP")).toBe(true);
    expect(isStateCode("XX")).toBe(false);
  });
});

describe("courtFeeFor", () => {
  it("uses the Maharashtra Court-fees Act in Maharashtra", () => {
    const r = courtFeeFor("MH", rupees(5_00_000));
    expect(r).toEqual({ feePaise: maharashtraCourtFee(rupees(5_00_000)), act: "Maharashtra Court-fees Act", note: null });
  });

  it("returns no fee (not a guess) where the Maharashtra slab is unverified", () => {
    const r = courtFeeFor("MH", rupees(50_000));
    expect(r.feePaise).toBeNull();
    expect(r.act).toBe("Maharashtra Court-fees Act");
    expect(r.note).toMatch(/LEGAL_REVIEW/);
  });

  it("refuses to compute for a state whose rules are not configured", () => {
    const r = courtFeeFor("MP", rupees(5_00_000));
    expect(r).toEqual({
      feePaise: null,
      act: null,
      note: "Court-fee rules for Madhya Pradesh are not configured yet [[LEGAL_REVIEW]]",
    });
  });
});

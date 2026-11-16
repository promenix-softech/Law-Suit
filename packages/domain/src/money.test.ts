import { describe, expect, it } from "vitest";
import { parseRupees } from "./money";

describe("parseRupees", () => {
  it("reads Indian-grouped rupees into paise", () => {
    expect(parseRupees("1,50,000")).toBe(1_50_00_000);
    expect(parseRupees("₹ 25,000.00")).toBe(25_00_000);
    expect(parseRupees("Rs. 1500")).toBe(1_50_000);
  });
  it("keeps paise exact without floating point", () => {
    expect(parseRupees("1500.5")).toBe(1_50_050);
    expect(parseRupees("0.07")).toBe(7);
    expect(parseRupees("19.99")).toBe(1_999);
  });
  it("refuses negatives, three decimals and words", () => {
    expect(parseRupees("-5")).toBeNull();
    expect(parseRupees("1.234")).toBeNull();
    expect(parseRupees("ten")).toBeNull();
    expect(parseRupees("")).toBeNull();
  });
});

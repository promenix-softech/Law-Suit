import { describe, expect, it } from "vitest";
import { amountInWordsINR, numberToWordsIndian } from "./words";

describe("numberToWordsIndian", () => {
  it.each([
    [0, "Zero"],
    [7, "Seven"],
    [19, "Nineteen"],
    [45, "Forty-Five"],
    [100, "One Hundred"],
    [1_000, "One Thousand"],
    [24_430, "Twenty-Four Thousand Four Hundred Thirty"],
    [1_00_000, "One Lakh"],
    [12_34_567, "Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven"],
    [1_00_00_000, "One Crore"],
    [1_05_00_000, "One Crore Five Lakh"],
  ])("%i → %s", (n, words) => {
    expect(numberToWordsIndian(n)).toBe(words);
  });

  it("rejects negatives and fractions", () => {
    expect(() => numberToWordsIndian(-1)).toThrow();
    expect(() => numberToWordsIndian(1.5)).toThrow();
  });
});

describe("amountInWordsINR", () => {
  it("includes paise when present", () => {
    expect(amountInWordsINR(9_987_713)).toBe(
      "Rupees Ninety-Nine Thousand Eight Hundred Seventy-Seven and Paise Thirteen Only",
    );
  });
  it("omits zero paise", () => {
    expect(amountInWordsINR(2_443_000)).toBe("Rupees Twenty-Four Thousand Four Hundred Thirty Only");
  });
});

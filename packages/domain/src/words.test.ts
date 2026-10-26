import { describe, expect, it } from "vitest";
import { amountInWordsINR, numberToWordsIndian, rupeesInWords } from "./words";

describe("rupeesInWords (pleading style)", () => {
  it.each([
    [14_45_310_00, "Fourteen Lakh Forty-Five Thousand Three Hundred and Ten Rupees Only"],
    [14_25_310_00, "Fourteen Lakh Twenty-Five Thousand Three Hundred and Ten Rupees Only"],
    [31_230_00, "Thirty-One Thousand Two Hundred and Thirty Rupees Only"],
    [1_234_00, "One Thousand Two Hundred and Thirty-Four Rupees Only"],
    [25_000_00, "Twenty-Five Thousand Rupees Only"],
    [7_00, "Seven Rupees Only"],
    [1_234_50, "One Thousand Two Hundred and Thirty-Four Rupees and Fifty Paise Only"],
  ])("%i paise → %s", (paise, words) => {
    expect(rupeesInWords(paise)).toBe(words);
  });
});

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

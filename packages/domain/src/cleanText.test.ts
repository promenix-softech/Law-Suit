import { describe, expect, it } from "vitest";
import { cleanText, hasLetter } from "./cleanText";

describe("cleanText", () => {
  it("removes control characters pasted with a name", () => {
    expect(cleanText("RAMESH\u0007 TEST\u0000 PATIL\u001B")).toBe("RAMESH TEST PATIL");
    expect(cleanText("DEMO\u0085AGRO\u009F TRADERS")).toBe("DEMOAGRO TRADERS");
  });

  it("removes invisible and direction-changing characters", () => {
    expect(cleanText("KIRAN​ TEST‮ PAWAR﻿")).toBe("KIRAN TEST PAWAR");
  });

  it("keeps the joiners Marathi needs inside a word", () => {
    // र्‍य (eyelash ra) uses ZWJ between Devanagari letters
    expect(cleanText("क्‍ष")).toBe("क्‍ष");
    expect(cleanText("नमुना ‍चाचणी")).toBe("नमुना चाचणी");
  });

  it("stores the same Marathi text the same way (NFC)", () => {
    // क़ typed as one code point or as क + nukta is stored as the same string
    expect(cleanText("क़")).toBe(cleanText("क़"));
  });

  it("makes a name one line with single spaces", () => {
    expect(cleanText("  M/S DEMO\tAGRO\r\nTRADERS  ")).toBe("M/S DEMO AGRO TRADERS");
  });

  it("keeps every inner line of multi-line text, tidying each", () => {
    expect(cleanText(" FLAT 0,\u0007 SAMPLE HEIGHTS \r\n\r\n DEMO ROAD\t NASHIK ", { multiline: true })).toBe(
      "FLAT 0, SAMPLE HEIGHTS\n\nDEMO ROAD NASHIK",
    );
    expect(cleanText("\n\nA\n\n\nB\n\n", { multiline: true })).toBe("\n\nA\n\n\nB");
  });

  it("removes direction marks, format characters and characters that print as blank", () => {
    expect(cleanText("RAMESH‎ TEST‏؜ PATIL­")).toBe("RAMESH TEST PATIL");
    expect(cleanText("ㅤㅤ")).toBe("");
    expect(cleanText("Aᅟᅠﾠ͏᠎B")).toBe("AB");
  });

  it("stays fast on long hostile input (no backtracking)", () => {
    const start = performance.now();
    expect(cleanText(`${"\n".repeat(200_000)}x${"\n".repeat(200_000)}`, { multiline: true })).toBe(`${"\n".repeat(200_000)}x`);
    expect(cleanText(" ".repeat(200_000) + "x")).toBe("x");
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("tells whether a name has a letter in it", () => {
    expect(hasLetter("किरण")).toBe(true);
    expect(hasLetter("M/S")).toBe(true);
    expect(hasLetter("०१२ - /")).toBe(false);
    expect(hasLetter("")).toBe(false);
  });

  it("leaves clean text alone and returns empty for nothing", () => {
    expect(cleanText("गाळा 0, चाचणी मार्केट यार्ड, नाशिक 422000")).toBe("गाळा 0, चाचणी मार्केट यार्ड, नाशिक 422000");
    expect(cleanText("\u0000​ \t")).toBe("");
  });
});

import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptText, encryptText } from "../crypto";
import { normaliseStatus, ocrErrorMessage, pagesFromResults } from "./sarvam";

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("field encryption", () => {
  it("round-trips Unicode text (English + Marathi)", () => {
    const text = "Sanction letter — कर्ज मंजुरी पत्र ₹2,60,000";
    const stored = encryptText(text);
    expect(stored).toMatch(/^\\x[0-9a-f]+$/);
    expect(stored).not.toContain("Sanction");
    expect(decryptText(stored)).toBe(text);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptText("same")).not.toBe(encryptText("same"));
  });

  it("detects tampering", () => {
    const stored = encryptText("amount 100");
    const flipped = stored.slice(0, -2) + (stored.endsWith("00") ? "01" : "00");
    expect(() => decryptText(flipped)).toThrow();
  });

  it("refuses a wrong-length key", () => {
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptText("x")).toThrow(/32 bytes/);
    process.env.FIELD_ENCRYPTION_KEY = saved;
  });
});

describe("pagesFromResults", () => {
  it("maps page numbers and trims content", () => {
    const res = { documents: [{ pages: [{ page_number: 2, content: " B " }, { page_number: 1, content: "A\n" }] }] };
    expect(pagesFromResults(res)).toEqual([
      { pageNo: 1, text: "A" },
      { pageNo: 2, text: "B" },
    ]);
  });

  it("falls back to position and tolerates empty results", () => {
    expect(pagesFromResults({ documents: [{ pages: [{ content: "x" }] }] })).toEqual([{ pageNo: 1, text: "x" }]);
    expect(pagesFromResults({})).toEqual([]);
    expect(pagesFromResults(null)).toEqual([]);
  });
});

describe("normaliseStatus", () => {
  it.each([
    ["Completed", "completed"],
    ["partially_completed", "partially_completed"],
    ["FAILED", "failed"],
    ["Running", "running"],
    ["Accepted", "running"],
    ["Pending", "running"],
  ])("%s → %s", (input, out) => {
    expect(normaliseStatus(input)).toBe(out);
  });
});

describe("ocrErrorMessage", () => {
  it("explains common API errors without leaking details", () => {
    expect(ocrErrorMessage({ statusCode: 402 })).toMatch(/credits/);
    expect(ocrErrorMessage({ statusCode: 403 })).toMatch(/key/);
    expect(ocrErrorMessage(new Error("socket hang up sk_secret"))).not.toContain("sk_");
  });
});

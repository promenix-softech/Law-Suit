import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAffidavit } from "./affidavit";
import type { CaptionInput } from "./caption";
import { toPlainText } from "./model";
import { buildVakalatnama } from "./vakalatnama";

const base: CaptionInput = {
  court: { name: "Civil Judge Senior Division", place: "Pune" },
  year: 2026,
  suitType: "commercial",
  bank: { name: "State Bank of India", branch: "Demo Branch, Pune" },
  defendants: [
    { name: "Vijay Sample Jadhav", role: "borrower", address: "Synthetic address, Pune" },
    { name: "Asha Fake Jadhav", role: "guarantor", address: null },
  ],
};

const golden = (name: string) => readFileSync(new URL(`./__golden__/${name}`, import.meta.url), "utf8");

describe("buildVakalatnama", () => {
  it("matches the golden text", () => {
    expect(toPlainText(buildVakalatnama(base))).toBe(golden("vakalatnama.en.txt"));
  });

  it("has boxes for both stamps and flags their amounts", () => {
    const t = toPlainText(buildVakalatnama(base));
    expect(t).toContain("[ Advocates' Welfare Fund stamp ₹20 ]");
    expect(t).toContain("[ Court-fee stamp ₹10 ]");
    expect(t).toMatch(/\[\[LEGAL_REVIEW\]\] Stamp amounts/);
  });

  it("names the appointed advocates with enrolment numbers", () => {
    const t = toPlainText(buildVakalatnama({ ...base, advocates: [{ name: "A. Demo Advocate", enrolmentNo: "MAH/0000/2010" }] }));
    expect(t).toContain("appoint and retain A. Demo Advocate");
    expect(t).toContain("Enrolment No. MAH/0000/2010");
  });

  it("omits defendant addresses in the caption", () => {
    expect(toPlainText(buildVakalatnama(base))).not.toContain("Synthetic address");
  });
});

describe("buildAffidavit", () => {
  it("matches the golden text (commercial → statement of truth)", () => {
    expect(toPlainText(buildAffidavit(base))).toBe(golden("statement_of_truth.en.txt"));
  });

  it("is an affidavit in support for non-commercial suits", () => {
    const doc = buildAffidavit({ ...base, suitType: "ordinary" });
    expect(doc.templateId).toBe("affidavit.en");
    const t = toPlainText(doc);
    expect(t).toContain("AFFIDAVIT IN SUPPORT OF THE PLAINT");
    expect(t).not.toContain("consequences of making a false statement");
  });

  it("leaves the top of the first page blank for stamp paper", () => {
    expect(buildAffidavit(base).blocks[0]).toEqual({ kind: "spacer", lines: 8, note: "Stamp paper — leave this space blank" });
  });

  it("requires a defendant", () => {
    expect(() => buildAffidavit({ ...base, defendants: [] })).toThrow();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAffidavit } from "./affidavit";
import { toPlainText } from "./model";
import { captionFixture as base, officeFixture } from "./testFixtures";
import { buildVakalatnama } from "./vakalatnama";

const golden = (name: string) => readFileSync(new URL(`./__golden__/${name}`, import.meta.url), "utf8");

describe("buildVakalatnama (office format)", () => {
  it("matches the golden text", () => {
    expect(toPlainText(buildVakalatnama({ ...base, office: officeFixture }))).toBe(golden("vakalatnama.en.txt"));
  });

  it("appoints the firm and its advocates and prints the firm block", () => {
    const t = toPlainText(buildVakalatnama({ ...base, office: officeFixture }));
    expect(t).toContain("hereby appoint and authorise DEMO LEGAL ASSOCIATES, ADV. A. DEMO and ADV. B. SAMPLE to act, appear and plead");
    expect(t).toContain("ADVOCATE CODE – 00000");
    expect(t).toContain("(SANAD NO: MAH/0000/2020)");
    expect(t).toContain(">> Exhibit No. ______");
  });

  it("prints blanks when the office profile is not set", () => {
    const t = toPlainText(buildVakalatnama(base));
    expect(t).toContain("appoint and authorise __________ to act");
    expect(t).toContain("OFFICE: __________");
  });

  it("uses the short caption (no addresses, no officer)", () => {
    const t = toPlainText(buildVakalatnama(base));
    expect(t).not.toContain("Fake Industrial Estate");
    expect(t).not.toContain("AGE:");
  });
});

describe("buildAffidavit (office format)", () => {
  it("matches the golden text (affidavit in support of plaint)", () => {
    expect(toPlainText(buildAffidavit(base))).toBe(golden("affidavit.en.txt"));
  });

  it("is sworn by the officer for the Plaintiff (not 'Applicant') with the AFFIDAVIT page header", () => {
    const d = buildAffidavit(base);
    expect(d.runningHeader).toBe("AFFIDAVIT");
    const t = toPlainText(d);
    expect(t).toContain("I, NEHA DEMO DESHMUKH, Age: 39 years, Occupation: Service, Senior Manager of the Plaintiff Bank");
    expect(t).toContain("Adv. for Plaintiff");
    expect(t).not.toContain("Applicant");
  });

  it("is a flagged statement of truth for commercial suits", () => {
    const d = buildAffidavit({ ...base, suitType: "commercial" });
    expect(d.templateId).toBe("statement_of_truth.en");
    expect(toPlainText(d)).toContain("consequences of making a false statement");
  });

  it("requires a defendant", () => {
    expect(() => buildAffidavit({ ...base, defendants: [] })).toThrow();
  });
});

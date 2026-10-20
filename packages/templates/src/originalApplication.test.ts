import { readFileSync } from "node:fs";
import { drtFee, rupees } from "@civil-suits/domain";
import { describe, expect, it } from "vitest";
import { renderDocx } from "./docx";
import { toPlainText } from "./model";
import { buildOriginalApplication, type OriginalApplicationInput } from "./originalApplication";

const claim = rupees(25_40_000);
const base: OriginalApplicationInput = {
  bench: { name: "Debts Recovery Tribunal", place: "Pune" },
  year: 2026,
  bank: { name: "Bank of Maharashtra", branch: "Demo Branch, Pune" },
  defendants: [
    { name: "Prakash Demo Shinde", role: "borrower", address: "Synthetic address, Pune" },
    { name: "Kavita Test Pawar", role: "guarantor", address: null },
  ],
  loan: { facilityType: "Term Loan", accountLast4: "4021", sanctionDate: "2022-03-14", sanctionAmountPaise: rupees(22_00_000), rateBps: 1050, npaDate: "2024-08-31" },
  claimPaise: claim,
  claimAsOn: "2026-09-30",
  feePaise: drtFee(claim),
  notice: { date: "2026-07-01" },
  filingDate: "2026-10-21",
};

const golden = readFileSync(new URL("./__golden__/drt_original_application.en.txt", import.meta.url), "utf8");

describe("buildOriginalApplication", () => {
  const text = toPlainText(buildOriginalApplication(base));

  it("matches the golden text", () => {
    expect(text).toBe(golden);
  });

  it("is an application under Section 19 before the bench", () => {
    expect(text).toContain("BEFORE THE DEBTS RECOVERY TRIBUNAL");
    expect(text).toContain("(Under Section 19 of the Recovery of Debts and Bankruptcy Act, 1993)");
    expect(text).toContain("… APPLICANT");
  });

  it("states the fee computed in code and the debt in words", () => {
    expect(text).toContain("Application fee of ₹28,000.00");
    expect(text).toContain("₹25,40,000.00 (Rupees Twenty-Five Lakh Forty Thousand Only)");
  });

  it("flags every part heading and prescribed paragraph", () => {
    expect(text.match(/\[\[LEGAL_REVIEW\]\]/g)!.length).toBeGreaterThanOrEqual(9);
  });

  it("uses the DRT layout", async () => {
    const model = buildOriginalApplication(base);
    expect(model.layout).toBe("drt");
    const buf = await renderDocx(model);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});

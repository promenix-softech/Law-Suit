import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDemandNotice, formatDateIN, type DemandNoticeInput } from "./demandNotice";
import { toPlainText } from "./model";
import { noticeFixture, officeFixture } from "./testFixtures";
const text = (over: Partial<DemandNoticeInput> = {}) => toPlainText(buildDemandNotice({ ...noticeFixture, ...over }));

describe("buildDemandNotice (office format)", () => {
  it("matches the golden text", () => {
    expect(text()).toBe(readFileSync(new URL("./__golden__/demand_notice.en.txt", import.meta.url), "utf8"));
  });

  it("is on the office letterhead with the addressees as in the caption", () => {
    const t = text();
    expect(t).toContain("[letterhead] DEMO LEGAL ASSOCIATES");
    expect(t).toContain("1. M/S DEMO AGRO TRADERS");
    expect(t).toContain("   Through its Partner\n   KIRAN TEST PAWAR");
    expect(t).toContain("ADDRESS: FLAT 0, SAMPLE HEIGHTS, DEMO ROAD, NASHIK 422000");
  });

  it("names each addressee's role and tabulates every facility with tenure", () => {
    const t = text();
    expect(t).toContain("the Addressee No. 1 is the Borrower and the Addressees No. 2 and 3 are the Guarantors");
    expect(t).toContain("Term Loan (for purchase of a tractor-trailer) | Rs. 9,50,000/- | 10.25% | 60 Months | XXXXXX0041");
    expect(t).toContain("Cash Credit (for working capital) | Rs. 6,00,000/- | 9.90% | N.A. | XXXXXX0087");
  });

  it("demands the computed total within the office's period and claims the notice fee", () => {
    const t = text();
    expect(t).toContain("Rs. 11,77,480/- (Eleven Lakh Seventy-Seven Thousand Four Hundred and Eighty Rupees Only), jointly and severally,");
    expect(t).toContain("within 7 days from the date of receipt");
    expect(t).toContain("Our professional fees including expenses of Rs. 3,500/-");
    expect(text({ office: { ...officeFixture, noticeFeeRupees: null } })).toContain("Our professional fees and expenses for issuing");
  });

  it("adds the 12A paragraph only for commercial claims", () => {
    expect(text({ isCommercial: true })).toContain("Section 12A");
    expect(text()).not.toContain("Section 12A");
  });

  it("works without an office profile (no letterhead) and refuses bad input", () => {
    expect(text({ office: null })).not.toContain("[letterhead]");
    expect(() => buildDemandNotice({ ...noticeFixture, defendants: [] })).toThrow();
    expect(() => buildDemandNotice({ ...noticeFixture, facilities: [] })).toThrow();
    expect(() => buildDemandNotice({ ...noticeFixture, paymentDays: 0 })).toThrow(RangeError);
  });

  it("formats dates the court way", () => {
    expect(formatDateIN("2026-10-20")).toBe("20-10-2026");
  });
});

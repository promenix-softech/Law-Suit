import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDemandNotice, formatDateIN, type DemandNoticeInput } from "./demandNotice";
import { toPlainText } from "./model";

const base: DemandNoticeInput = {
  noticeDate: "2026-10-20",
  refNo: "DEMO-2026-0003/DN/1",
  advocate: { officeName: "Demo Advocates (Synthetic)", address: "Synthetic address, Pune" },
  bank: { name: "State Bank of India", branch: "Demo Branch, Pune" },
  borrowers: [{ name: "Vijay Sample Jadhav", role: "borrower", address: "Synthetic address, Pune" }],
  loan: {
    facilityType: "Term Loan",
    accountLast4: "4002",
    sanctionDate: "2023-06-15",
    sanctionAmountPaise: 26_000_000,
    rateBps: 1050,
    npaDate: "2025-03-31",
    outstandingPaise: 30_550_652,
    interestUptoDate: "2026-10-20",
  },
  paymentDays: 15,
  isCommercial: true,
};

describe("buildDemandNotice", () => {
  it("matches the golden text", () => {
    const golden = readFileSync(new URL("./__golden__/demand_notice.en.commercial.txt", import.meta.url), "utf8");
    expect(toPlainText(buildDemandNotice(base))).toBe(golden);
  });

  it("adds the 12A paragraph only for commercial suits", () => {
    const text = (c: boolean) => toPlainText(buildDemandNotice({ ...base, isCommercial: c }));
    expect(text(true)).toContain("Section 12A");
    expect(text(false)).not.toContain("Section 12A");
  });

  it("masks the account number", () => {
    const text = toPlainText(buildDemandNotice(base));
    expect(text).toContain("XXXXXX4002");
  });

  it("flags legal-consequence paragraphs for review", () => {
    expect(toPlainText(buildDemandNotice(base))).toContain("[[LEGAL_REVIEW]]");
  });

  it("is laid out as a letter (1-inch margins), not a court pleading", () => {
    expect(buildDemandNotice(base).layout).toBe("letter");
  });

  it("requires a borrower", () => {
    expect(() => buildDemandNotice({ ...base, borrowers: [] })).toThrow();
  });
});

describe("formatDateIN", () => {
  it("formats ISO dates as DD-MM-YYYY", () => {
    expect(formatDateIN("2025-03-31")).toBe("31-03-2025");
  });
});

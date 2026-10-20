import { describe, expect, it } from "vitest";
import { caseKey, classifyPage, groupPages, normaliseAccount, sameAccount } from "./classify";

// OCR output of the synthetic scans (apps/worker/scripts/synthetic-scans.ts), noise included.
const SANCTION = `SANCTION LETTER
SYNTHETIC — DEMO ONLY
BANK OF MAHARASHTRA
To;
Meena Fake Deshmukh
We are pleased to inform you that a Vehicle Loan of ~10,50,000.00 has
been sanctioned to you at a rate of interest of 11.75% per annum.
Loan account no.: DEMO0040033
Sanctioned amount: ~10,50,000.00`;
const AGREEMENT = `LOAN AGREEMENT (EXTRACT)
This agreement is made at Nashik on 08/04/2021 between Bank of
Maharashtra ("the Bank") and Meena Fake Deshmukh, residing at Plot
13, Synthetic Nagar ("the Borrower"), with Nitin Fake Deshmukh as Guarantor.`;
const STATEMENT = `STATEMENT OF ACCOUNT
Account: DEMO00040033
Name: Meena Fake Deshmukh
Date Particulars Debit Credit Balance
08/04/20 | Loan disbursed ~10,50,0 ~10,50,00`;
const NPA = `NPA CLASSIFICATION NOTICE
Dear Meena Fake Deshmukh, your loan account no. DEMO0040033
has been classified as a Non-Performing Asset on 08/01/2023 as per
RBI norms.`;

describe("classifyPage", () => {
  it.each([
    [SANCTION, "sanction_letter"],
    [AGREEMENT, "loan_agreement"],
    [STATEMENT, "account_statement"],
    [NPA, "npa_notice"],
    ["Blank page with a stamp", "other"],
  ])("classifies %#", (text, cls) => {
    expect(classifyPage(text).class).toBe(cls);
  });
  it("is less sure about thin evidence", () => {
    expect(classifyPage(SANCTION).confidence).toBeGreaterThan(classifyPage("Debit Credit Balance statement of account").confidence * 0.5);
    expect(classifyPage("xyz").confidence).toBeLessThan(0.6);
  });
});

describe("caseKey", () => {
  it("reads the account number and borrower", () => {
    expect(caseKey(SANCTION).account).toBe(normaliseAccount("DEMO0040033"));
    expect(caseKey(STATEMENT)).toEqual({ account: normaliseAccount("DEMO00040033"), borrower: "Meena Fake Deshmukh" });
    expect(caseKey(NPA).borrower).toBe("Meena Fake Deshmukh");
    expect(caseKey(AGREEMENT).account).toBeNull();
  });
  it("treats one OCR slip as the same account", () => {
    expect(sameAccount(normaliseAccount("DEMO0040033"), normaliseAccount("DEMO00040033"))).toBe(true);
    expect(sameAccount(normaliseAccount("DEMO0040033"), normaliseAccount("DEMO0040134"))).toBe(false);
  });
});

describe("groupPages", () => {
  const k = (pageNo: number, account: string | null, borrower: string | null = null) => ({
    pageNo,
    account: account && normaliseAccount(account),
    borrower,
  });
  it("splits two loan files and keeps unnumbered pages with the one before", () => {
    const groups = groupPages([
      k(1, "DEMO0040033"),
      k(2, null),
      k(3, "DEMO00040033"),
      k(4, "DEMO0040033"),
      k(5, "DEMO0040021"),
      k(6, null),
      k(7, "DEMO0040021"),
    ]);
    expect(groups).toEqual([1, 1, 1, 1, 2, 2, 2]);
  });
  it("puts a page back with its account even after another file", () => {
    expect(groupPages([k(1, "DEMO0040033"), k(2, "DEMO0040021"), k(3, "DEMO0040033")])).toEqual([1, 2, 1]);
  });
  it("uses the borrower name when no account is printed", () => {
    expect(groupPages([k(1, "DEMO0040033", "Ramesh Demo Patil"), k(2, "DEMO0040021"), k(3, null, "Ramesh Demo Patil")])).toEqual([1, 2, 1]);
  });
});

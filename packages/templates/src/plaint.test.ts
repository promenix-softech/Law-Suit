import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatRs, maharashtraCourtFee, particularsOfClaim, rupees } from "@civil-suits/domain";
import { toPlainText } from "./model";
import { buildDraftDecree, buildPlaint, type PlaintInput } from "./plaint";
import { plaintFixture } from "./testFixtures";

const text = (over: Partial<PlaintInput> = {}) => toPlainText(buildPlaint({ ...plaintFixture, ...over }));
const golden = (name: string) => readFileSync(new URL(`./__golden__/${name}`, import.meta.url), "utf8");

describe("buildPlaint (office format)", () => {
  it("matches the golden text (Order XXXVII summary suit)", () => {
    expect(text()).toBe(golden("plaint.summary_o37.en.txt"));
  });

  it("matches the golden text (commercial suit)", () => {
    const mediation = { reportDate: "2026-10-10", outcome: "non_starter" as const };
    expect(text({ suitType: "commercial", mediation })).toBe(golden("plaint.commercial.en.txt"));
  });

  it("prints a shared address once ('ADDRESS OF 1, 2 & 3'), separate ones under each defendant", () => {
    const addr = "Gala 0, Test Market Yard, Nashik 422000";
    const shared = text({ defendants: plaintFixture.defendants.map((d) => ({ ...d, address: addr })) });
    expect(shared).toContain("ADDRESS OF 1, 2 & 3:\n   GALA 0, TEST MARKET YARD, NASHIK 422000");
    expect(text()).not.toContain("ADDRESS OF");
  });

  it("uses the office caption: court line, special summary suit, full plaintiff and addresses", () => {
    const t = text();
    expect(t).toContain("IN THE COURT OF CIVIL JUDGE SENIOR DIVISION NASHIK, AT NASHIK");
    expect(t).toContain("SPECIAL SUMMARY SUIT NO. __________/2026");
    expect(t).toContain("(Under Order XXXVII of the Code of Civil Procedure, 1908)");
    expect(t).toContain("Through its Senior Manager\nNEHA DEMO DESHMUKH\nAGE: 39 YEARS");
    expect(t).toContain("Banking Companies (Acquisition and Transfer of Undertakings) Act, 1970");
    expect(t).toContain("1. M/S DEMO AGRO TRADERS\n");
    expect(t).toContain("   Through its Partner\n   KIRAN TEST PAWAR");
    expect(t).toContain("3. RAHUL FAKE PAWAR (GUARANTOR)");
    expect(t).toContain("ADDRESS: FLAT 0, SAMPLE HEIGHTS, DEMO ROAD, NASHIK 422000");
    expect(t).toContain(">> ...DEFENDANTS");
  });

  it("prints a junior-division summary suit and an ordinary suit by their registry names", () => {
    expect(text({ court: { name: "Civil Judge Junior Division", place: "Nashik" } })).toContain("SUMMARY SUIT NO.");
    expect(text({ suitType: "ordinary" })).toContain("SPECIAL CIVIL SUIT NO.");
    expect(text({ suitType: "ordinary" })).not.toContain("Order XXXVII");
  });

  it("states the claim heads and total computed in code, in Rs. x/- style with words", () => {
    const t = text();
    expect(t).toContain("A | Principal outstanding plus normal interest as on 30.06.2026 | Rs. 11,62,480/-");
    expect(t).toContain("B | Penal interest | NIL");
    expect(t).toContain("C | Expenses incurred | Rs. 15,000/-");
    expect(t).toContain("Total claim amount as on 30.06.2026 (A + B + C) | Rs. 11,77,480/-");
    expect(t).toContain("Rs. 11,77,480/- (Eleven Lakh Seventy-Seven Thousand Four Hundred and Eighty Rupees Only)");
  });

  it("marks penal interest 'To be determined' and flags the draft when it is not decided yet", () => {
    const claim = particularsOfClaim({ principalInterestPaise: rupees(11_62_480), penalInterestPaise: null, expensesPaise: rupees(15_000) });
    const t = text({ claim });
    expect(t).toContain("B | Penal interest | To be determined");
    expect(t).toContain("[[LEGAL_REVIEW]] Penal interest (B) is still to be determined");
    expect(text()).not.toContain("To be determined");
  });

  it("refers to the particulars-of-claim paragraph by its real number", () => {
    const t = text();
    const claimPara = /\n(\d+)\. PARTICULARS OF CLAIM:/.exec(t)?.[1];
    expect(t).toContain(`as set out in paragraph ${claimPara} above`);
  });

  it("states the court fee computed in code", () => {
    expect(text()).toContain(`court fee of ${formatRs(maharashtraCourtFee(rupees(11_77_480)))} is paid`);
  });

  it("lists every facility with its executed documents as a), b), …", () => {
    const t = text();
    expect(t).toContain("a) Demand Promissory Note dated 06.12.2021.");
    expect(t).toContain("a) Deed of Hypothecation of Stock and Book Debts dated 24.08.2023.");
    expect(t).toContain("Loan Account No. XXXXXX0041 and XXXXXX0087");
    expect(t).toContain("10.25% and 9.90% per annum respectively");
  });

  it("flags a facility whose executed documents are not yet known", () => {
    const facilities = [{ ...plaintFixture.facilities[0]!, documents: [] }];
    expect(text({ facilities })).toContain("[[LEGAL_REVIEW]] List of loan and security documents executed");
  });

  it("carries the Order XXXVII Rule 2 averments only for summary suits, and no sale-of-security prayer", () => {
    expect(text()).toContain("No relief which does not fall within the ambit of Order XXXVII has been claimed");
    expect(text({ suitType: "ordinary" })).not.toContain("ambit of Order XXXVII");
    expect(text()).not.toMatch(/be (ordered to be )?sold/);
  });

  it("pleads the demand notice when one was sent", () => {
    expect(text()).toContain("demand notice dated 20.07.2026");
    expect(text({ notice: null })).not.toContain("demand notice");
  });

  it("commercial: pleads 12A compliance and a statement of truth instead of verification", () => {
    const t = text({ suitType: "commercial", mediation: { reportDate: "2026-10-10", outcome: "failed" } });
    expect(t).toContain("Section 12A");
    expect(t).toContain("STATEMENT OF TRUTH");
    expect(t).toContain("COMMERCIAL SUIT NO.");
    expect(text()).toContain("VERIFICATION");
    expect(text({ suitType: "commercial", mediation: null })).toContain("must not be filed without it");
  });

  it("flags court fee when the slab is unverified, and never names Maharashtra law for an unconfigured state", () => {
    expect(text({ courtFeePaise: null })).toContain("[[LEGAL_REVIEW]] slab to be verified");
    const t = text({ courtFeePaise: null, courtFeeAct: null });
    expect(t).not.toContain("Maharashtra Court-fees");
    expect(t).toContain("[[LEGAL_REVIEW]] court-fee rules for this State to be configured");
  });

  it("prints blanks, not guesses, when the officer or the bank's constitution is unknown", () => {
    const t = text({ officer: null, bank: { name: "Demo Co-operative Bank", branch: "Demo Branch" } });
    expect(t).toContain("Through its Authorised Officer\n__________\nAGE: ____ YEARS");
    expect(t).toContain("[[LEGAL_REVIEW]] Constitution of the plaintiff bank");
  });

  it("numbers paragraphs consecutively", () => {
    const nums = buildPlaint(plaintFixture)
      .blocks.flatMap((b) => (b.kind === "para" ? [/^(\d+)\. /.exec(b.text)?.[1]] : []))
      .filter(Boolean)
      .map(Number);
    expect(nums.length).toBeGreaterThan(10);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it("has page numbers and requires a defendant and a facility", () => {
    expect(buildPlaint(plaintFixture).pageNumbers).toBe(true);
    expect(() => buildPlaint({ ...plaintFixture, defendants: [] })).toThrow();
    expect(() => buildPlaint({ ...plaintFixture, facilities: [] })).toThrow();
  });

  it("handles a single defendant and a single facility grammatically", () => {
    const t = text({ defendants: [plaintFixture.defendants[0]!], facilities: [plaintFixture.facilities[0]!] });
    expect(t).toContain("M/S DEMO AGRO TRADERS\n");
    expect(t).toContain(">> ...DEFENDANT\n");
    expect(t).not.toContain("jointly and severally");
    expect(t).not.toContain("respectively");
  });

  it("uses whatever claim total the caller computed (no arithmetic in the template)", () => {
    const claim = particularsOfClaim({ principalInterestPaise: rupees(5_00_000), penalInterestPaise: rupees(1_000), expensesPaise: 0 });
    expect(text({ claim })).toContain("Rs. 5,01,000/-");
  });

  it("writes the purpose after 'for' even when the user typed it without", () => {
    const [first, ...rest] = plaintFixture.facilities;
    const t = text({ facilities: [{ ...first!, purpose: "Working capital" }, ...rest] });
    expect(t).toContain("a request to grant a Term Loan for working capital.");
    expect(text()).toContain("for purchase of a tractor-trailer.");
    expect(text()).not.toContain("for for");
  });
});

describe("buildDraftDecree", () => {
  it("is the plaint's paragraphs under the running header DECREE, without prayer or verification", () => {
    const d = buildDraftDecree(plaintFixture);
    expect(d.runningHeader).toBe("DECREE");
    const t = toPlainText(d);
    expect(t).toContain("PARTICULARS OF CLAIM");
    expect(t).toContain("craves leave");
    expect(t).not.toContain("prays");
    expect(t).not.toContain("VERIFICATION");
  });
});

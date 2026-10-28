import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatRs, maharashtraCourtFee, rupees } from "@civil-suits/domain";
import { toPlainText } from "./model";
import {
  buildAddressMemo,
  buildBbeCertificate,
  buildCourtFeeLetter,
  buildEfilingSheet,
  buildListOfDocuments,
  standardDocuments,
} from "./suitPapers";
import { captionFixture, officeFixture, plaintFixture } from "./testFixtures";

const golden = (name: string) => readFileSync(new URL(`./__golden__/${name}`, import.meta.url), "utf8");

describe("buildAddressMemo", () => {
  it("matches the golden text: full caption, pursis, ADDRESS MEMO header", () => {
    const d = buildAddressMemo(captionFixture);
    expect(d.runningHeader).toBe("ADDRESS MEMO");
    expect(toPlainText(d)).toBe(golden("address_memo.en.txt"));
  });
});

describe("standardDocuments + buildListOfDocuments", () => {
  const entries = standardDocuments(plaintFixture);

  it("follows the office order: officer ID and authority, per facility application and documents, notice, BBE certificate, statement", () => {
    expect(entries.map((e) => e.title)).toEqual([
      "Photocopy of identity proof of the authorised officer of the Plaintiff bank.",
      "Photocopy of authority letter / power of attorney in favour of the authorised officer of the Plaintiff bank.",
      "Photocopy of loan application form for Rs. 9,50,000/- dated 18.11.2021.",
      "Photocopy of Demand Promissory Note dated 06.12.2021.",
      "Photocopy of Term Loan Agreement dated 06.12.2021.",
      "Photocopy of Deed of Guarantee dated 06.12.2021.",
      "Photocopy of loan application form for Rs. 6,00,000/- dated 09.08.2023.",
      "Photocopy of Deed of Hypothecation of Stock and Book Debts dated 24.08.2023.",
      "Photocopy of demand notice through the Plaintiff's advocate dated 20.07.2026, with proof of dispatch.",
      "Certificate under the Bankers' Books Evidence Act, 1891.",
      "Account statement of loan account no. XXXXXX0041 and XXXXXX0087.",
    ]);
  });

  it("adds the 12A report for a commercial suit", () => {
    const e = standardDocuments({ ...plaintFixture, suitType: "commercial", mediation: { reportDate: "2026-10-10", outcome: "failed" } });
    expect(e.map((x) => x.title)).toContain("Section 12A mediation report dated 10.10.2026.");
  });

  it("matches the golden text with annexures A, B, C … and the total", () => {
    const t = toPlainText(buildListOfDocuments({ ...captionFixture, entries }));
    expect(t).toBe(golden("list_of_documents.en.txt"));
    expect(t).toContain("11. | Account statement");
    expect(t).toContain("Annexure K");
    expect(t).toContain("Total documents submitted on behalf of the Plaintiff: 11.");
  });

  it("refuses an empty list", () => {
    expect(() => buildListOfDocuments({ ...captionFixture, entries: [] })).toThrow();
  });
});

describe("buildBbeCertificate", () => {
  it("matches the golden text and flags the s.2A(b)/(c) particulars", () => {
    const t = toPlainText(buildBbeCertificate({ ...plaintFixture, place: "Nashik" }));
    expect(t).toBe(golden("bbe_certificate.en.txt"));
    expect(t).toContain("M/S DEMO AGRO TRADERS through its Partner KIRAN TEST PAWAR, Loan A/c No. XXXXXX0041 and XXXXXX0087");
    expect(t).toContain("[[LEGAL_REVIEW]] Section 2A(b) and (c)");
  });
});

describe("buildCourtFeeLetter", () => {
  const fee = maharashtraCourtFee(plaintFixture.claim.totalPaise);
  const letter = (office = officeFixture) =>
    toPlainText(
      buildCourtFeeLetter({
        refNo: "INV/DLA/CF/DEMO01",
        date: "2026-09-10",
        bank: captionFixture.bank,
        borrower: "M/s Demo Agro Traders",
        claimPaise: plaintFixture.claim.totalPaise,
        courtFeePaise: fee,
        courtFeeAct: "Maharashtra Court-fees Act, 1959",
        office,
      }),
    );

  it("matches the golden text: fee computed in code, office account to remit to", () => {
    expect(letter()).toBe(golden("court_fee_letter.en.txt"));
    expect(letter()).toContain(`TOTAL COURT FEE (STAMP DUTY): ${formatRs(fee)}`);
    expect(letter()).toContain("A/c No.: 000000000000");
  });

  it("prints blanks when the office has no fee account set", () => {
    expect(letter({ firmName: "Demo Legal Associates" })).toContain("A/c No.: __________");
  });
});

describe("buildEfilingSheet", () => {
  const t = toPlainText(buildEfilingSheet(plaintFixture));

  it("matches the golden text", () => {
    expect(t).toBe(golden("efiling_sheet.en.txt"));
  });

  it("fills amount and valuation (never 0) and the Order 37 section", () => {
    expect(t).toContain("Valuation: 11,77,480");
    expect(t).toContain("Amount: 11,77,480");
    expect(t).toContain("Section: Order 37");
    expect(t).toContain("Case type / Relief sought: Summary Suit");
    expect(t).toContain("Organisation type: Nationalised Banks");
  });

  it("carries the Marathi relief line with the amount filled in", () => {
    expect(t).toContain("प्रतिवादीकडून रक्कम रु. 11,77,480/- व्याज व खर्चासह वसूल होऊन मिळावी, ही विनंती.");
  });
});

import { courtFeeFor, particularsOfClaim, rupees } from "@civil-suits/domain";
import type { CaptionInput } from "./caption";
import type { DemandNoticeInput } from "./demandNotice";
import type { OfficeProfile } from "./format";
import type { PlaintInput } from "./plaint";

/**
 * Invented demo case used by template tests and samples. Nothing in it comes from a real
 * file: names, bank, branch, court, addresses, dates and amounts are all made up.
 */
export const captionFixture: CaptionInput = {
  court: { name: "Civil Judge Senior Division", place: "Nashik" },
  year: 2026,
  suitType: "summary_o37",
  bank: { name: "Union Bank of India", branch: "Model Colony Branch (Demo), Nashik", address: "Shop 0, Demo Arcade, Model Colony, Nashik 422000" },
  officer: { name: "Neha Demo Deshmukh", designation: "Senior Manager", age: 39 },
  defendants: [
    { name: "M/s Demo Agro Traders", role: "borrower", address: "Gala 0, Test Market Yard, Nashik 422000", through: { capacity: "Partner", name: "Kiran Test Pawar" } },
    { name: "Kiran Test Pawar", role: "guarantor", address: "Gala 0, Test Market Yard, Nashik 422000" },
    { name: "Rahul Fake Pawar", role: "guarantor", address: "Flat 0, Sample Heights, Demo Road, Nashik 422000" },
  ],
};

const claim = particularsOfClaim({ principalInterestPaise: rupees(11_62_480), penalInterestPaise: 0, expensesPaise: rupees(15_000) });

export const plaintFixture: PlaintInput = {
  ...captionFixture,
  facilities: [
    {
      facilityType: "Term Loan",
      accountNo: "XXXXXX0041",
      sanctionAmountPaise: rupees(9_50_000),
      sanctionDate: "2021-12-02",
      applicationDate: "2021-11-18",
      purpose: "for purchase of a tractor-trailer",
      rateBps: 1025,
      tenureMonths: 60,
      documents: [
        { title: "Demand Promissory Note", date: "2021-12-06" },
        { title: "Term Loan Agreement", date: "2021-12-06" },
        { title: "Deed of Guarantee", date: "2021-12-06" },
      ],
    },
    {
      facilityType: "Cash Credit",
      accountNo: "XXXXXX0087",
      sanctionAmountPaise: rupees(6_00_000),
      sanctionDate: "2023-08-21",
      applicationDate: "2023-08-09",
      purpose: "for working capital",
      rateBps: 990,
      documents: [{ title: "Deed of Hypothecation of Stock and Book Debts", date: "2023-08-24" }],
    },
  ],
  npaDate: "2026-01-31",
  claim,
  claimAsOn: "2026-06-30",
  courtFeePaise: courtFeeFor("MH", claim.totalPaise).feePaise,
  courtFeeAct: "Maharashtra Court-fees Act, 1959",
  notice: { date: "2026-07-20" },
  mediation: null,
  urgentInterimRelief: false,
  filingDate: "2026-10-26",
};

/** The demo office's profile — the same invented values as docs/samples/demo-office-profile.json. */
export const officeFixture: OfficeProfile = {
  firmName: "Demo Legal Associates",
  firmTagline: "Advocates & Legal Consultants",
  advocateCode: "00000",
  sanadNo: "MAH/0000/2020",
  address: "Office 0, Synthetic Chambers, Demo Road, Nashik 422000",
  contact: "+91-90000 00000",
  email: "office@demo-legal.test",
  advocates: ["ADV. A. DEMO", "ADV. B. SAMPLE"],
  feeAccount: { accountName: "Demo Legal Associates", accountNo: "000000000000", accountType: "Current", bank: "Demo Bank", branch: "Nashik", ifsc: "DEMO0000000" },
  refPrefix: "DLA",
  noticeDays: 7,
  noticeFeeRupees: 3500,
};

export const noticeFixture: DemandNoticeInput = {
  noticeDate: "2026-07-20",
  office: officeFixture,
  bank: captionFixture.bank,
  defendants: captionFixture.defendants,
  facilities: plaintFixture.facilities,
  npaDate: plaintFixture.npaDate,
  claimPaise: plaintFixture.claim.totalPaise,
  claimAsOn: "2026-06-30",
  paymentDays: 7,
  isCommercial: false,
};

import { amountInWordsINR, formatINR, type Paise } from "@civil-suits/domain";
import type { Block, DocModel } from "./model";

export interface DemandNoticeInput {
  noticeDate: string; // ISO date
  refNo: string;
  advocate: { officeName: string; address: string };
  bank: { name: string; branch: string };
  borrowers: { name: string; role: "borrower" | "co_borrower" | "guarantor"; address?: string | null }[];
  loan: {
    facilityType: string;
    accountLast4: string | null;
    sanctionDate: string | null;
    sanctionAmountPaise: Paise | null;
    rateBps: number | null;
    npaDate: string | null;
    outstandingPaise: Paise;
    interestUptoDate: string;
  };
  /** Days given to pay; 15 is common practice, not statutory. */
  paymentDays: number;
  isCommercial: boolean;
}

const ROLE_LABEL = { borrower: "Borrower", co_borrower: "Co-Borrower", guarantor: "Guarantor" } as const;

/** DD-MM-YYYY, the format used in Maharashtra court papers. */
export function formatDateIN(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) throw new RangeError(`Invalid date: ${iso}`);
  return `${d}-${m}-${y}`;
}

const pct = (bps: number) => `${(bps / 100).toFixed(2)}% p.a.`;

/**
 * Demand notice for recovery of a bank loan (civil suit route — distinct from a SARFAESI
 * 13(2) notice). There is no statutory form; content follows docs/plan.md B2. Paragraphs on
 * legal consequences are flagged for the advocate's review before use.
 */
export function buildDemandNotice(input: DemandNoticeInput): DocModel {
  const { loan, bank } = input;
  if (input.borrowers.length === 0) throw new Error("At least one borrower is required");
  if (!Number.isInteger(input.paymentDays) || input.paymentDays < 1) throw new RangeError("paymentDays must be ≥ 1");

  const facilityRows: [string, string][] = [
    ["Facility", loan.facilityType],
    ["Loan account", loan.accountLast4 ? `XXXXXX${loan.accountLast4}` : "—"],
  ];
  if (loan.sanctionDate) facilityRows.push(["Date of sanction", formatDateIN(loan.sanctionDate)]);
  if (loan.sanctionAmountPaise != null) facilityRows.push(["Amount sanctioned", formatINR(loan.sanctionAmountPaise)]);
  if (loan.rateBps != null) facilityRows.push(["Rate of interest", pct(loan.rateBps)]);
  if (loan.npaDate) facilityRows.push(["Classified as NPA on", formatDateIN(loan.npaDate)]);
  facilityRows.push([
    `Amount due as on ${formatDateIN(loan.interestUptoDate)}`,
    `${formatINR(loan.outstandingPaise)} (${amountInWordsINR(loan.outstandingPaise)})`,
  ]);

  const blocks: Block[] = [
    { kind: "heading", text: "Subject: Demand for repayment of outstanding loan dues" },
    {
      kind: "para",
      text: `Under instructions from and on behalf of our client, ${bank.name}, ${bank.branch} (hereinafter "the Bank"), we address you as follows:`,
    },
    {
      kind: "para",
      text: "At your request, the Bank sanctioned and disbursed the credit facility described below. You agreed to repay the same with interest as per the terms of sanction and the loan documents executed by you.",
    },
    { kind: "fields", rows: facilityRows },
    {
      kind: "para",
      text: "You have failed to repay the dues as agreed, and the account has been classified as a Non-Performing Asset in accordance with the applicable norms.",
    },
    {
      kind: "para",
      text: `We therefore call upon you, jointly and severally, to pay the Bank ${formatINR(loan.outstandingPaise)} (${amountInWordsINR(loan.outstandingPaise)}) together with further interest at the contractual rate from ${formatDateIN(loan.interestUptoDate)} until the date of payment, within ${input.paymentDays} days of receipt of this notice.`,
    },
    {
      kind: "para",
      legalReview: true,
      text: "Take notice that if you fail to pay within the said period, our client shall be constrained to initiate appropriate legal proceedings for recovery, including a civil suit, at your risk as to costs and consequences.",
    },
  ];

  if (input.isCommercial) {
    blocks.push({
      kind: "para",
      legalReview: true,
      text: "As the claim is a commercial dispute of specified value, our client is also willing to participate in pre-institution mediation under Section 12A of the Commercial Courts Act, 2015, should you wish to settle the matter.",
    });
  }

  blocks.push(
    { kind: "para", text: "A copy of this notice is retained in our office for further action." },
    { kind: "signature", lines: ["Yours faithfully,", "", "", `For ${input.advocate.officeName}`, "Advocates for the Bank"] },
  );

  return {
    templateId: "demand_notice.en",
    version: 1,
    effectiveFrom: "2026-10-20",
    legalBasis: "No statutory form; elements per docs/plan.md B2 (civil recovery, not SARFAESI 13(2))",
    title: "DEMAND NOTICE",
    meta: [`Ref.: ${input.refNo}`, `Date: ${formatDateIN(input.noticeDate)}`, "By RPAD / Speed Post / Email"],
    to: input.borrowers.flatMap((p, i) => [
      `${i + 1}. ${p.name} (${ROLE_LABEL[p.role]})`,
      ...(p.address ? [`   ${p.address}`] : []),
    ]),
    blocks,
  };
}

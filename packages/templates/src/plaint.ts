import { amountInWordsINR, formatINR, type Paise } from "@civil-suits/domain";
import { caption, type CaptionInput } from "./caption";
import { formatDateIN } from "./demandNotice";
import type { Block, DocModel } from "./model";

export interface PlaintInput extends CaptionInput {
  loan: {
    facilityType: string;
    accountLast4: string | null;
    sanctionDate: string | null;
    sanctionAmountPaise: Paise | null;
    rateBps: number | null;
    npaDate: string | null;
  };
  /** Principal + interest up to claimAsOn — computed by the caller in code. */
  claimPaise: Paise;
  claimAsOn: string;
  /** From maharashtraCourtFee(); null when the slab is not yet verified. */
  courtFeePaise: Paise | null;
  notice?: { date: string } | null;
  /** Commercial suits: Sec 12A outcome, or urgent interim relief sought instead. */
  mediation?: { reportDate: string; outcome: "failed" | "non_starter" } | null;
  urgentInterimRelief?: boolean;
  filingDate: string;
}

const pct = (bps: number) => `${(bps / 100).toFixed(2)}% per annum`;
const rv = (text: string): Block => ({ kind: "para", text, legalReview: true });

/**
 * Plaint for recovery of a bank loan (CPC Order VII Rule 1 particulars). Statutory or
 * court-specific wording that has not been verified is left as a flagged paragraph for the
 * advocate — see skill indian-civil-plaint. Amounts and court fee arrive pre-computed.
 */
export function buildPlaint(input: PlaintInput): DocModel {
  const { loan } = input;
  const commercial = input.suitType === "commercial";
  const claim = `${formatINR(input.claimPaise)} (${amountInWordsINR(input.claimPaise)})`;
  let n = 0;
  const p = (text: string, legalReview = false): Block => ({ kind: "para", text: `${++n}. ${text}`, legalReview });

  const blocks: Block[] = [
    ...caption(input),
    { kind: "center", bold: true, lines: [`SUIT FOR RECOVERY OF ${formatINR(input.claimPaise)} WITH INTEREST AND COSTS`] },
    { kind: "para", text: "The Plaintiff above named states as under:" },

    p("Description and constitution of the Plaintiff bank, and authority of the signing officer.", true),
    p(
      `At the request of the Defendants, the Plaintiff sanctioned a ${loan.facilityType}` +
        (loan.sanctionAmountPaise != null ? ` of ${formatINR(loan.sanctionAmountPaise)}` : "") +
        (loan.sanctionDate ? ` on ${formatDateIN(loan.sanctionDate)}` : "") +
        (loan.rateBps != null ? `, carrying interest at ${pct(loan.rateBps)}` : "") +
        `, in loan account no. XXXXXX${loan.accountLast4 ?? "____"}. The Defendants executed the loan and security documents, which are annexed hereto.`,
    ),
    p(
      "The Defendants failed to repay the instalments and interest as agreed" +
        (loan.npaDate ? `, and the account was classified as a Non-Performing Asset on ${formatDateIN(loan.npaDate)}` : "") +
        ".",
    ),
  ];

  if (input.notice) {
    blocks.push(
      p(`The Plaintiff, through its advocates, issued a demand notice dated ${formatDateIN(input.notice.date)} calling upon the Defendants to repay the dues. The Defendants have failed to pay.`),
    );
  }

  blocks.push(
    p(`As per the books of account of the Plaintiff, a sum of ${claim} is due and payable by the Defendants, jointly and severally, as on ${formatDateIN(input.claimAsOn)}, as shown in the statement of account annexed hereto.`),
    p(
      `The cause of action arose on the sanction and disbursement of the facility, on default in repayment` +
        (loan.npaDate ? `, on ${formatDateIN(loan.npaDate)} when the account was classified as NPA` : "") +
        (input.notice ? `, and on expiry of the period stated in the demand notice dated ${formatDateIN(input.notice.date)}` : "") +
        ", and continues from day to day.",
    ),
    p(`Territorial and pecuniary jurisdiction of this Court at ${input.court.place}; the suit is within limitation.`, true),
    p(
      `The suit is valued at ${claim} for the purposes of jurisdiction and court fees. ` +
        (input.courtFeePaise != null
          ? `Court fee of ${formatINR(input.courtFeePaise)} is paid under the Maharashtra Court-fees Act.`
          : "Court fee as applicable under the Maharashtra Court-fees Act is paid. [[LEGAL_REVIEW]] slab to be verified."),
    ),
    p("Claim for interest pendente lite and future interest, and its rate.", true),
  );

  if (commercial) {
    if (input.urgentInterimRelief) {
      blocks.push(p("The suit contemplates urgent interim relief; grounds for exemption from pre-institution mediation under Section 12A of the Commercial Courts Act, 2015.", true));
    } else if (input.mediation) {
      blocks.push(
        p(`The Plaintiff applied for pre-institution mediation under Section 12A of the Commercial Courts Act, 2015. The mediation ${input.mediation.outcome === "failed" ? "failed" : "was a non-starter"} and the report dated ${formatDateIN(input.mediation.reportDate)} is annexed hereto.`),
      );
    } else {
      blocks.push(p("Section 12A mediation report not yet available — the plaint must not be filed without it. [[LEGAL_REVIEW]]", true));
    }
  }

  if (input.suitType === "summary_o37") {
    blocks.push(p("Averment required under Order XXXVII Rule 2 of the Code of Civil Procedure, 1908.", true));
  }

  blocks.push(
    p("The Plaintiff therefore prays that:"),
    {
      kind: "list",
      items: [
        `the Defendants be ordered and decreed, jointly and severally, to pay the Plaintiff ${claim} with interest as claimed above;`,
        "the Defendants be ordered to pay the costs of the suit;",
        "such other and further relief be granted as this Court deems fit in the circumstances of the case.",
      ],
    },
    { kind: "signature", lines: [`Place: ${input.court.place}`, `Date: ${formatDateIN(input.filingDate)}`, "", "Advocate for the Plaintiff", "", "Plaintiff (through authorised officer)"] },
    { kind: "heading", text: commercial ? "Statement of truth" : "Verification" },
    rv(
      commercial
        ? "Statement of truth in the format prescribed for commercial suits, by the authorised officer of the Plaintiff."
        : "Verification under Order VI Rule 15 of the Code of Civil Procedure, 1908, by the authorised officer of the Plaintiff.",
    ),
    { kind: "heading", text: "List of documents" },
    {
      kind: "list",
      items: [
        "Sanction letter",
        "Loan and security documents",
        "Statement of account with certificate under the Bankers' Books Evidence Act, 2026",
        ...(input.notice ? ["Demand notice with proof of dispatch"] : []),
        ...(commercial && input.mediation ? ["Section 12A mediation report"] : []),
        "Authority of the signing officer",
      ],
    },
  );

  return {
    templateId: `plaint.${input.suitType}.en`,
    version: 1,
    effectiveFrom: "2026-10-20",
    legalBasis: "CPC Order VII Rule 1; Order XXXVII (summary); Commercial Courts Act 2015 s.12A; Maharashtra Court-fees Act Sch. I Art. 1",
    title: "PLAINT",
    meta: [],
    to: [],
    blocks,
  };
}

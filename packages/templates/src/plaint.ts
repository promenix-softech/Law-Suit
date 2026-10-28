import { formatRs, rupeesInWords, type Paise, type ParticularsOfClaim } from "@civil-suits/domain";
import { caption, defs, type CaptionInput } from "./caption";
import { BLANK, formatDateDot, joinAnd, pctBps } from "./format";
import type { Block, DocModel } from "./model";

/** One loan facility sued upon. A case may have several (e.g. term loan + cash credit). */
export interface Facility {
  /** e.g. "Term Loan (Priority)", "Cash Credit (Working Capital)". */
  facilityType: string;
  /** As printed; drafts carry the masked number until the full one is filled in. */
  accountNo: string | null;
  sanctionAmountPaise: Paise | null;
  sanctionDate: string | null;
  /** Date the borrower applied for the facility. */
  applicationDate?: string | null;
  /** "for the purpose of working capital". */
  purpose?: string | null;
  rateBps: number | null;
  /** Loan and security documents executed for this facility, in date order. */
  documents?: { title: string; date: string | null }[];
  /** Repayment period in months; none for running limits such as cash credit ("N.A."). */
  tenureMonths?: number | null;
}

export interface PlaintInput extends CaptionInput {
  facilities: Facility[];
  npaDate: string | null;
  /** Heads A/B/C and total — computed with particularsOfClaim() in code. */
  claim: ParticularsOfClaim;
  /** Date up to which interest is applied in the claim. */
  claimAsOn: string;
  /** From courtFeeFor(); null when the slab or the state's rules are not yet verified. */
  courtFeePaise: Paise | null;
  /** Court-fee statute of the court's state; null when the state is not configured yet. */
  courtFeeAct: string | null;
  notice?: { date: string } | null;
  /** Commercial suits: Sec 12A outcome, or urgent interim relief sought instead. */
  mediation?: { reportDate: string; outcome: "failed" | "non_starter" } | null;
  urgentInterimRelief?: boolean;
  filingDate: string;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const rs = (paise: Paise) => `${formatRs(paise)} (${rupeesInWords(paise)})`;
const accounts = (fs: Facility[]) => joinAnd(fs.map((f) => f.accountNo ?? BLANK));
const rates = (fs: Facility[]) => joinAnd(fs.map((f) => (f.rateBps != null ? pctBps(f.rateBps) : "____%")));
/** " for working capital" — the office writes the purpose after "for"; added when it was left out. */
const forPurpose = (purpose?: string | null) => {
  const t = purpose?.trim();
  if (!t) return "";
  return /^for\b/i.test(t) ? ` ${t}` : ` for ${t[0]!.toLowerCase()}${t.slice(1)}`;
};

/**
 * Plaint for recovery of bank dues in the office's format (see skill bank-suit-house-style):
 * caption, title line, facts per facility with the documents executed, interest, accounts
 * (Bankers' Books Evidence Act), dues, default and NPA, demand notice, particulars of claim,
 * cause of action, jurisdiction and limitation, no other suit, valuation and court fee, leave
 * to amend, prayer, verification. All amounts and the court fee arrive computed in code.
 *
 * `decree: true` returns the paragraphs only (no prayer or verification) under the running
 * header "DECREE" — the draft decree the office files with an Order XXXVII suit.
 */
export function buildPlaint(input: PlaintInput, opts: { decree?: boolean } = {}): DocModel {
  if (!input.facilities.length) throw new Error("At least one loan facility is required");
  const { facilities: fs, claim } = input;
  const commercial = input.suitType === "commercial";
  const summary = input.suitType === "summary_o37";
  const D = defs(input);
  const borrower = input.defendants[0]!;
  const borrowerName = `${borrower.name.toUpperCase()}${borrower.through ? `, through its ${borrower.through.capacity} ${borrower.through.name.toUpperCase()}` : ""}`;
  const facilityNames = joinAnd(fs.map((f) => f.facilityType));
  const asOn = formatDateDot(input.claimAsOn);

  let n = 0;
  const p = (text: string, legalReview = false): Block => ({ kind: "para", text: `${++n}. ${text}`, legalReview });
  const officer = input.officer;

  const blocks: Block[] = [
    ...caption(input),
    {
      kind: "lines",
      align: "center",
      bold: true,
      lines: [
        summary
          ? `SUIT UNDER ORDER XXXVII OF THE CODE OF CIVIL PROCEDURE, 1908 FOR RECOVERY OF ${formatRs(claim.totalPaise)}`
          : `SUIT FOR RECOVERY OF ${formatRs(claim.totalPaise)} WITH INTEREST AND COSTS`,
      ],
    },
    { kind: "para", text: "The Plaintiff above named most respectfully submits as under:" },
    p(
      `That the Plaintiff is a banking institution carrying on business, among others, of advancing finance for various purposes, having its branch at ${input.bank.branch}` +
        (input.bank.address?.trim() ? `, ${input.bank.address.trim()}` : "") +
        `. ${officer ? officer.name.toUpperCase() : BLANK}, the ${officer?.designation?.trim() || "Authorised Officer"} of the Plaintiff, is conversant with the facts of this suit and is competent to sign, verify and institute the present suit on behalf of the Plaintiff. ${cap(D)} availed the ${facilityNames} from the Plaintiff and ${input.defendants.length > 1 ? "are" : "is"} liable therefor.`,
    ),
  ];

  // One paragraph per facility, each followed by the documents executed for it.
  fs.forEach((f, i) => {
    const amt = f.sanctionAmountPaise != null ? formatRs(f.sanctionAmountPaise) : `Rs. ${BLANK}/-`;
    blocks.push(
      i === 0
        ? p(
            `That the Defendant No. 1 was in need of financial assistance of ${amt} and therefore approached the Plaintiff Bank${f.applicationDate ? ` on ${formatDateDot(f.applicationDate)}` : ""} with a request to grant a ${f.facilityType}${forPurpose(f.purpose)}. After considering the loan application, the Plaintiff sanctioned the ${f.facilityType} of ${amt}${f.sanctionDate ? ` on ${formatDateDot(f.sanctionDate)}` : ""}. For availing the said facility, ${D} executed the following documents in favour of the Plaintiff Bank:`,
          )
        : {
            kind: "para",
            text: `That ${D} further approached the Plaintiff Bank${f.applicationDate ? ` on ${formatDateDot(f.applicationDate)}` : ""} for a ${f.facilityType} of ${amt}${forPurpose(f.purpose)}, which the Plaintiff sanctioned${f.sanctionDate ? ` on ${formatDateDot(f.sanctionDate)}` : ""}. For availing the said facility, ${D} executed the following documents in favour of the Plaintiff Bank:`,
          },
    );
    blocks.push(
      f.documents?.length
        ? { kind: "list", style: "alpha", items: f.documents.map((d) => `${d.title}${d.date ? ` dated ${formatDateDot(d.date)}` : ""}.`) }
        : { kind: "para", legalReview: true, text: "List of loan and security documents executed for this facility, with dates — to be filled from the loan file." },
      { kind: "para", text: `${cap(D)} agreed and assured to abide by the terms and conditions contained therein.` },
    );
  });

  blocks.push(
    p(
      `By the said documents, ${D} agreed to repay the said ${fs.length > 1 ? "facilities" : "facility"} on demand together with interest at the rate of ${rates(fs)} per annum${fs.length > 1 ? " respectively" : ""}, with monthly rests, or at such other rate as may be prescribed by the Plaintiff Bank from time to time upon reset of the rate of interest.`,
    ),
    p(
      `${cap(D)} signed the application cum proposal, accepted the terms and conditions contained therein, and agreed and assured to abide by them. By the said documents ${D} assured to repay the loan amount on demand with interest at the rate aforesaid, and the said ${fs.length > 1 ? "facilities are" : "facility is"} governed by the terms and conditions contained in the said documents.`,
    ),
    p(
      `In pursuance of the aforesaid arrangement, the Defendant No. 1 opened Loan Account No. ${accounts(fs)} with the Plaintiff Bank, in which entries are made as and when the transactions take place. The Plaintiff is required by law to maintain accounts and has maintained them in the usual and ordinary course of its business. A true and certified extract of the said account${fs.length > 1 ? "s" : ""}, with a certificate in accordance with the provisions of the Bankers' Books Evidence Act, 1891, is produced herewith.`,
    ),
    p(
      `That a sum of ${rs(claim.principalInterestPaise)} is due and outstanding in the said loan account${fs.length > 1 ? "s" : ""} as on ${asOn}, inclusive of interest applied up to ${asOn}, payable by ${D} to the Plaintiff Bank${input.defendants.length > 1 ? " jointly and severally" : ""}.`,
    ),
    p(
      `That ${D} failed to repay the said amount along with interest as agreed. The loan account of the Defendant No. 1 was classified as a Non-Performing Asset (NPA) on ${input.npaDate ? formatDateDot(input.npaDate) : BLANK} due to non-payment of the instalments and interest. The Plaintiff made repeated attempts to contact ${D} for repayment, but ${D} did not respond and failed and neglected to repay the dues under the ${facilityNames}.`,
    ),
  );

  if (input.notice) {
    blocks.push(
      p(
        `The Plaintiff, through its advocate, issued a demand notice dated ${formatDateDot(input.notice.date)} to ${D}, calling upon ${D} to repay the outstanding dues. Despite the notice, ${D} failed to pay the said amount.`,
      ),
    );
  }

  if (commercial) {
    if (input.urgentInterimRelief) {
      blocks.push(p("The suit contemplates urgent interim relief; grounds for exemption from pre-institution mediation under Section 12A of the Commercial Courts Act, 2015.", true));
    } else if (input.mediation) {
      blocks.push(
        p(`The Plaintiff applied for pre-institution mediation under Section 12A of the Commercial Courts Act, 2015. The mediation ${input.mediation.outcome === "failed" ? "failed" : "was a non-starter"} and the report dated ${formatDateDot(input.mediation.reportDate)} is annexed hereto.`),
      );
    } else {
      blocks.push(p("Section 12A mediation report not yet available — the plaint must not be filed without it. [[LEGAL_REVIEW]]", true));
    }
  }

  const claimPara = n + 1;
  const facilityAmounts = joinAnd(fs.map((f) => (f.sanctionAmountPaise != null ? formatRs(f.sanctionAmountPaise) : `Rs. ${BLANK}/-`)));
  blocks.push(
    p("PARTICULARS OF CLAIM:"),
    {
      kind: "table",
      head: ["Sr. No.", "Particulars", `Total Outstanding as on ${asOn}`],
      widths: [12, 58, 30],
      rows: [
        ["", `${facilityNames.toUpperCase()} ${fs.length > 1 ? "facilities" : "facility"} of ${facilityAmounts} granted to ${borrowerName}, Loan Account No. ${accounts(fs)}`, ""],
        ["A", `Principal outstanding plus normal interest as on ${asOn}`, formatRs(claim.principalInterestPaise)],
        ["B", "Penal interest", claim.penalPending ? "To be determined" : claim.penalInterestPaise ? formatRs(claim.penalInterestPaise) : "NIL"],
        ["C", "Expenses incurred", claim.expensesPaise ? formatRs(claim.expensesPaise) : "NIL"],
        ["", `Total claim amount as on ${asOn} (A + B + C)`, formatRs(claim.totalPaise)],
        ["", `With further interest thereon at ${rates(fs)} per annum from ${asOn} till the date of filing of the plaint and thereafter till the date of payment and/or realisation`, ""],
      ],
    },
    // Penal interest is settled later in the office's practice; the draft says so instead of guessing.
    ...(claim.penalPending
      ? [
          {
            kind: "para",
            legalReview: true,
            text: "Penal interest (B) is still to be determined; the total, valuation and court fee exclude it. Enter it in Suit particulars (0 for NIL) and regenerate before filing.",
          } satisfies Block,
        ]
      : []),
    p(causeOfAction(input)),
    p(
      `The Plaintiff and ${D} reside or carry on business within the jurisdiction of this Hon'ble Court, and the transaction took place at the Plaintiff's ${input.bank.branch}, within the territorial jurisdiction of this Hon'ble Court. This Hon'ble Court therefore has jurisdiction to try the suit. The claim of the Plaintiff is not barred by the law of limitation, and the suit is filed within the period of limitation prescribed by law.`,
    ),
  );

  if (summary) {
    // CPC Order XXXVII Rule 2(1)(a) and (b): the two averments a summary-suit plaint must carry.
    blocks.push(
      p("The present suit is filed under Order XXXVII of the Code of Civil Procedure, 1908. No relief which does not fall within the ambit of Order XXXVII has been claimed in this plaint."),
    );
  }

  blocks.push(
    p(`The Plaintiff submits that no other suit or proceeding has been filed or is pending against ${D} in respect of the subject matter of this suit in any other court of law.`),
    p(
      `The Plaintiff has filed the present suit for recovery of ${rs(claim.totalPaise)} as set out in paragraph ${claimPara} above. The suit is valued at ${formatRs(claim.totalPaise)} for the purposes of jurisdiction and court fees, and ` +
        (!input.courtFeeAct
          ? "court fee as applicable under the court-fees law in force in the State is paid herewith. [[LEGAL_REVIEW]] court-fee rules for this State to be configured."
          : input.courtFeePaise != null
            ? `the necessary court fee of ${formatRs(input.courtFeePaise)} is paid herewith under the ${input.courtFeeAct}.`
            : `court fee as applicable under the ${input.courtFeeAct} is paid herewith. [[LEGAL_REVIEW]] slab to be verified.`),
    ),
    p("The Plaintiff craves leave of this Hon'ble Court to amend, alter or add to the facts and pleadings in the plaint as and when required."),
  );

  if (opts.decree) {
    return { ...meta(input), templateId: `draft_decree.${input.suitType}.en`, legalBasis: "CPC Order XX Rule 6 (contents of decree); office practice", title: "", runningHeader: "DECREE", pageNumbers: true, blocks };
  }

  const several = input.defendants.length > 1 ? `, jointly and severally,` : "";
  blocks.push(
    p("The Plaintiff therefore most humbly prays that:"),
    {
      kind: "list",
      style: "alpha",
      items: [
        `a judgment and decree be passed against ${D}${several} for ${rs(claim.totalPaise)} together with further interest at the rate of ${rates(fs)} per annum with monthly rests from ${asOn} till realisation of the full amount;`,
        `${D} be ordered to pay the full costs of this suit to the Plaintiff;`,
        "such other just and equitable orders be passed as this Hon'ble Court deems fit in the interest of justice;",
        "the Plaintiff be allowed to amend the plaint, if necessary.",
      ],
    },
    { kind: "lines", lines: [`PLACE: ${input.court.place.toUpperCase()}`, `DATE: __/__/${input.year}`] },
    { kind: "sign2", left: ["", "ADVOCATE FOR PLAINTIFF"], right: ["", "PLAINTIFF"] },
    { kind: "lines", align: "center", bold: true, lines: [commercial ? "STATEMENT OF TRUTH" : "VERIFICATION"] },
  );

  if (commercial) {
    blocks.push({ kind: "para", legalReview: true, text: "Statement of truth in the format prescribed for commercial suits, by the authorised officer of the Plaintiff." });
  } else {
    blocks.push({
      kind: "para",
      text: `I, ${officer ? officer.name.toUpperCase() : BLANK}, ${officer?.designation?.trim() || "Authorised Officer"}, ${input.bank.name}, ${input.bank.branch}, Age: ${officer?.age ?? "____"} years, Occupation: Service, do hereby state and declare that what is stated in paragraphs 1 to ${n - 1} above is true and correct as per the records of the Bank and to the best of my knowledge, information and belief, and the prayers are as advised. Hence I have signed hereunder at ${input.court.place} on this ____ day of ______________, ${input.year}.`,
    });
  }
  blocks.push({ kind: "sign2", left: [], right: ["", "PLAINTIFF"] });

  return { ...meta(input), blocks };
}

/** Cause-of-action paragraph, shared by the plaint and the e-filing data sheet. */
export function causeOfAction(input: PlaintInput): string {
  const D = defs(input);
  const facilityNames = joinAnd(input.facilities.map((f) => f.facilityType));
  return (
    `The cause of action for the present suit arose at ${input.court.place}, within the jurisdiction of this Hon'ble Court, firstly on ${input.npaDate ? formatDateDot(input.npaDate) : BLANK} when ${D} stopped repaying the ${facilityNames} and the loan account${input.facilities.length > 1 ? "s were" : " was"} classified as NPA` +
    (input.notice ? `, and thereafter on ${D} failing to pay in terms of the demand notice dated ${formatDateDot(input.notice.date)}` : "") +
    `. The cause of action is continuing every day till the filing of this suit, as the amount borrowed by ${D} remains to be repaid to the Plaintiff Bank.`
  );
}

function meta(input: PlaintInput): Omit<DocModel, "blocks"> {
  return {
    templateId: `plaint.${input.suitType}.en`,
    version: 2,
    effectiveFrom: "2026-10-26",
    legalBasis: `CPC Order VII Rule 1; Order XXXVII Rule 2 (summary); Commercial Courts Act 2015 s.12A; Bankers' Books Evidence Act 1891; ${input.courtFeeAct ? `${input.courtFeeAct} Sch. I Art. 1` : "State court-fees law [[LEGAL_REVIEW]]"}`,
    title: "",
    meta: [],
    to: [],
    pageNumbers: true,
  };
}

/** Draft decree: the plaint's paragraphs under the running header "DECREE". */
export const buildDraftDecree = (input: PlaintInput): DocModel => buildPlaint(input, { decree: true });

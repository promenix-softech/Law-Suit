import { amountInWordsINR, formatINR, type Paise } from "@civil-suits/domain";
import { ROLE_LABEL, type PartyRole } from "./caption";
import { formatDateIN } from "./demandNotice";
import type { Block, DocModel } from "./model";

export interface OriginalApplicationInput {
  bench: { name: string; place: string };
  year: number;
  bank: { name: string; branch: string };
  defendants: { name: string; role: PartyRole; address?: string | null }[];
  loan: {
    facilityType: string;
    accountLast4: string | null;
    sanctionDate: string | null;
    sanctionAmountPaise: Paise | null;
    rateBps: number | null;
    npaDate: string | null;
  };
  /** Debt due as on claimAsOn — computed in code by the caller. */
  claimPaise: Paise;
  claimAsOn: string;
  /** From drtFee(). */
  feePaise: Paise;
  notice?: { date: string } | null;
  filingDate: string;
}

const pct = (bps: number) => `${(bps / 100).toFixed(2)}% per annum`;

/**
 * Original Application under Section 19 of the Recovery of Debts and Bankruptcy Act, 1993.
 * Layout follows the DRT format profile (TNR 13, double spacing, left 5 cm / right 2.5 cm).
 * The part headings and every paragraph whose wording is prescribed are flagged until the
 * advocate checks them against the form under the DRT (Procedure) Rules, 1993.
 */
export function buildOriginalApplication(input: OriginalApplicationInput): DocModel {
  if (!input.defendants.length) throw new Error("At least one defendant is required");
  const { loan } = input;
  const debt = `${formatINR(input.claimPaise)} (${amountInWordsINR(input.claimPaise)})`;
  let n = 0;
  const p = (text: string, legalReview = false): Block => ({ kind: "para", text: `${++n}. ${text}`, legalReview });
  const part = (title: string): Block[] => [
    { kind: "heading", text: title },
    { kind: "para", legalReview: true, text: `Part heading and numbering to be matched with the prescribed form.` },
  ];

  const blocks: Block[] = [
    {
      kind: "center",
      bold: true,
      lines: [`BEFORE THE ${input.bench.name.toUpperCase()}`, `AT ${input.bench.place.toUpperCase()}`],
    },
    {
      kind: "center",
      lines: [
        `ORIGINAL APPLICATION NO. ________ OF ${input.year}`,
        "(Under Section 19 of the Recovery of Debts and Bankruptcy Act, 1993)",
      ],
    },
    { kind: "para", text: `${input.bank.name}, ${input.bank.branch}, through its authorised officer` },
    { kind: "center", lines: ["… APPLICANT"] },
    { kind: "center", bold: true, lines: ["VERSUS"] },
    {
      kind: "list",
      items: input.defendants.map((d) => `${d.name} (${ROLE_LABEL[d.role]})${d.address ? `, ${d.address}` : ""}`),
    },
    { kind: "center", lines: ["… DEFENDANTS"] },

    ...part("PART I — PARTICULARS OF THE APPLICANT AND THE DEFENDANTS"),
    p("Description and constitution of the Applicant bank, its address for service, and authority of the officer signing this application.", true),
    p("Name, description and address for service of each Defendant are as stated in the cause title above."),

    ...part("PART II — JURISDICTION, LIMITATION AND FACTS"),
    p(
      `The Applicant is a bank within the meaning of Section 2(d) of the Act and the debt due is ${debt}, which is not less than the pecuniary limit notified under Section 1(4). Territorial jurisdiction of this Tribunal at ${input.bench.place}.`,
      true,
    ),
    p("The application is within the period of limitation.", true),
    p(
      `At the request of the Defendants, the Applicant sanctioned a ${loan.facilityType}` +
        (loan.sanctionAmountPaise != null ? ` of ${formatINR(loan.sanctionAmountPaise)}` : "") +
        (loan.sanctionDate ? ` on ${formatDateIN(loan.sanctionDate)}` : "") +
        (loan.rateBps != null ? `, carrying interest at ${pct(loan.rateBps)}` : "") +
        `, in loan account no. XXXXXX${loan.accountLast4 ?? "____"}. The Defendants executed the loan and security documents, copies of which are annexed.`,
    ),
    p(
      "The Defendants failed to repay as agreed" +
        (loan.npaDate ? ` and the account was classified as a Non-Performing Asset on ${formatDateIN(loan.npaDate)}` : "") +
        "." +
        (input.notice ? ` A demand notice dated ${formatDateIN(input.notice.date)} was issued; the Defendants have not paid.` : ""),
    ),
    p(`As per the Applicant's books of account, ${debt} is due from the Defendants jointly and severally as on ${formatDateIN(input.claimAsOn)}, as shown in the statement of account annexed and certified under the Bankers' Books Evidence Act.`),
    p("Details of securities, their valuation, and any action taken under the SARFAESI Act, 2002.", true),
    p("Statement that no other proceeding for the same debt is pending before any court or tribunal, or particulars of such proceeding.", true),

    ...part("PART III — RELIEFS, FEE AND VERIFICATION"),
    p("The Applicant therefore prays that this Tribunal may be pleased to:"),
    {
      kind: "list",
      items: [
        `issue a certificate of recovery against the Defendants, jointly and severally, for ${debt} with interest from ${formatDateIN(input.claimAsOn)} till realisation;`,
        "award the costs of this application;",
        "grant such other relief as this Tribunal deems fit.",
      ],
    },
    { kind: "para", legalReview: true, text: "Rate of pendente lite and future interest claimed, and any interim relief (Section 19(12)/(13)) sought." },
    p(`Application fee of ${formatINR(input.feePaise)} (${amountInWordsINR(input.feePaise)}) is paid under Rule 7 of the DRT (Procedure) Rules, 1993.`, true),
    p("List of documents relied upon is annexed."),
    { kind: "para", legalReview: true, text: "Verification by the authorised officer of the Applicant, in the prescribed form." },
    { kind: "signature", lines: [`Place: ${input.bench.place}`, `Date: ${formatDateIN(input.filingDate)}`, "", "Authorised Officer, for the Applicant", "", "Advocate for the Applicant"] },
  ];

  return {
    templateId: "drt_original_application.en",
    version: 1,
    effectiveFrom: "2026-10-21",
    legalBasis: "Recovery of Debts and Bankruptcy Act, 1993 s.19; DRT (Procedure) Rules, 1993",
    title: "",
    meta: [],
    to: [],
    layout: "drt",
    blocks,
  };
}

import { caption, type CaptionInput } from "./caption";
import { BLANK } from "./format";
import type { Block, DocModel } from "./model";

export type AffidavitInput = CaptionInput;

/**
 * Affidavit of the Plaintiff's authorised officer in support of the plaint, in the office's
 * wording — or, for a commercial suit, the statement of truth, whose prescribed declarations
 * stay flagged for the advocate (nothing statutory is paraphrased).
 */
export function buildAffidavit(input: AffidavitInput): DocModel {
  const commercial = input.suitType === "commercial";
  const { bank, officer } = input;
  const who = `I, ${officer ? officer.name.toUpperCase() : BLANK}, Age: ${officer?.age ?? "____"} years, Occupation: Service, ${officer?.designation?.trim() || "Authorised Signatory"} of the Plaintiff Bank, i.e. ${bank.name}, ${bank.branch}`;

  const blocks: Block[] = [...caption(input, { full: false })];

  if (commercial) {
    blocks.push(
      { kind: "lines", align: "center", bold: true, lines: ["STATEMENT OF TRUTH"] },
      { kind: "para", text: `${who}, do hereby solemnly affirm and state as under:` },
      {
        kind: "para",
        text: "1. I am the authorised officer of the Plaintiff. I am conversant with the facts of the case from the records maintained by the Plaintiff in the ordinary course of its business, and I am competent to make this statement.",
      },
      {
        kind: "para",
        legalReview: true,
        text: "2. Declaration in the form prescribed for statements of truth in commercial suits, covering paragraphs 1 to ____ of the plaint and the documents relied upon.",
      },
      { kind: "para", text: "3. The documents annexed to the plaint are true copies of their originals, which are in the custody of the Plaintiff." },
      { kind: "para", legalReview: true, text: "4. Acknowledgement regarding the consequences of making a false statement of truth, as prescribed." },
    );
  } else {
    blocks.push(
      { kind: "lines", align: "center", bold: true, lines: ["AFFIDAVIT IN SUPPORT OF PLAINT"] },
      {
        kind: "para",
        text: `${who}, do hereby state on solemn affirmation that I know the facts of the case by virtue of my post and I have signed the plaint for and on behalf of the Plaintiff Bank. The contents of the paragraphs of the said plaint, along with the prayers made therein, are true and correct to the best of my knowledge, information and belief and as per the records of the Bank. I have not suppressed any material fact, and this affidavit is prepared as per my instructions. Hence I have signed and executed this affidavit on this ____ day of ______________, ${input.year} at ${input.court.place}.`,
      },
    );
  }

  blocks.push(
    { kind: "sign2", left: ["", "I know the Affiant", "", "", "Adv. for Plaintiff"], right: ["", "Affiant"] },
    // The office swears it before a notary, whose seal and register entry go here.
    { kind: "lines", align: "center", bold: true, lines: ["BEFORE ME", "", "", "Notary"] },
  );

  return {
    templateId: commercial ? "statement_of_truth.en" : "affidavit.en",
    version: 2,
    effectiveFrom: "2026-10-26",
    legalBasis: commercial
      ? "Commercial Courts Act 2015 — statement of truth (CPC as amended for commercial disputes)"
      : "CPC Order VI Rule 15(4) (affidavit in support of pleadings); office format",
    title: "",
    meta: [],
    to: [],
    blocks,
    runningHeader: commercial ? "STATEMENT OF TRUTH" : "AFFIDAVIT",
    pageNumbers: true,
  };
}

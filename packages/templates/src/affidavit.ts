import { caption, type CaptionInput } from "./caption";
import type { Block, DocModel } from "./model";

export type AffidavitInput = CaptionInput;

/**
 * Affidavit of the Plaintiff's authorised officer in support of the plaint — or, for a
 * commercial suit, the statement of truth. Laid out for stamp paper (blank top). The
 * prescribed declarations are flagged for the advocate; nothing statutory is paraphrased.
 */
export function buildAffidavit(input: AffidavitInput): DocModel {
  const commercial = input.suitType === "commercial";
  const { bank } = input;

  const blocks: Block[] = [
    { kind: "spacer", lines: 8, note: "Stamp paper — leave this space blank" },
    ...caption(input, { addresses: false }),
    {
      kind: "center",
      bold: true,
      lines: [commercial ? "STATEMENT OF TRUTH" : "AFFIDAVIT IN SUPPORT OF THE PLAINT"],
    },
    {
      kind: "para",
      text: `I, ____________________, aged ____ years, working as ______________ with the Plaintiff, ${bank.name}, ${bank.branch}, do hereby solemnly affirm and state as under:`,
    },
    {
      kind: "para",
      text: "1. I am the authorised officer of the Plaintiff. I am conversant with the facts of the case from the records maintained by the Plaintiff in the ordinary course of its business, and I am competent to make this affidavit.",
    },
    {
      kind: "para",
      legalReview: true,
      text: commercial
        ? "2. Declaration in the form prescribed for statements of truth in commercial suits, covering paragraphs 1 to ____ of the plaint and the documents relied upon."
        : "2. Declaration that the contents of paragraphs 1 to ____ of the plaint are true to my knowledge and based on the Plaintiff's records, in the form used for affidavits in support of pleadings.",
    },
    {
      kind: "para",
      text: "3. The documents annexed to the plaint are true copies of their originals, which are in the custody of the Plaintiff.",
    },
  ];

  if (commercial) {
    blocks.push({
      kind: "para",
      legalReview: true,
      text: "4. Acknowledgement regarding the consequences of making a false statement of truth, as prescribed.",
    });
  }

  blocks.push(
    { kind: "signature", lines: ["", "DEPONENT"] },
    { kind: "heading", text: "Verification" },
    {
      kind: "para",
      text: `Solemnly affirmed at ${input.court.place} on this ____ day of ______________ ${input.year}.`,
    },
    { kind: "signature", lines: ["Identified by me", "", "Advocate for the Plaintiff", "", "Before me", "", "Notary / Oath Commissioner"] },
  );

  return {
    templateId: commercial ? "statement_of_truth.en" : "affidavit.en",
    version: 1,
    effectiveFrom: "2026-10-20",
    legalBasis: commercial
      ? "Commercial Courts Act 2015 — statement of truth (CPC as amended for commercial disputes)"
      : "CPC Order VI Rule 15; Order XIX",
    // No page title: the top of stamp paper stays blank; the heading follows the caption.
    title: "",
    meta: [],
    to: [],
    blocks,
  };
}

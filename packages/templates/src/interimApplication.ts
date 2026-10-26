import { formatINR, type Paise } from "@civil-suits/domain";
import { caption, type CaptionInput } from "./caption";
import { formatDateIN } from "./demandNotice";
import type { Block, DocModel } from "./model";

export interface InterimApplicationInput extends CaptionInput {
  claimPaise: Paise;
  filingDate: string;
}

/**
 * Interim application filed with a commercial suit that seeks urgent interim relief (the
 * ground for not going through Sec 12A mediation first). Which provision applies and the
 * grounds are the advocate's call, so every substantive paragraph is flagged.
 */
export function buildInterimApplication(input: InterimApplicationInput): DocModel {
  if (input.suitType !== "commercial") throw new Error("Interim application template is for commercial suits");
  let n = 0;
  const p = (text: string, legalReview = false): Block => ({ kind: "para", text: `${++n}. ${text}`, legalReview });

  const blocks: Block[] = [
    { kind: "center", bold: true, lines: [`INTERIM APPLICATION NO. __________/${input.year}`, "IN"] },
    ...caption(input, { full: false }),
    { kind: "para", legalReview: true, text: "Provision under which the application is made (e.g. Order XXXVIII Rule 5 or Order XXXIX Rules 1 and 2, CPC) and the relief it seeks." },
    { kind: "center", bold: true, lines: ["APPLICATION FOR URGENT INTERIM RELIEF"] },
    { kind: "para", text: "The Applicant / Plaintiff above named states as under:" },
    p(`The Plaintiff has filed the accompanying commercial suit for recovery of ${formatINR(input.claimPaise)} with interest and costs. The contents of the plaint are not repeated for brevity and may be read as part of this application.`),
    p("Facts showing the urgency and why the relief cannot wait for the suit (e.g. alienation or removal of assets, dissipation of security).", true),
    p("Prima facie case.", true),
    p("Balance of convenience.", true),
    p("Irreparable loss or injury if the relief is not granted.", true),
    p("Statement that the suit contemplates urgent interim relief, and therefore pre-institution mediation under Section 12A of the Commercial Courts Act, 2015 is not required.", true),
    p("The Plaintiff therefore prays that this Court may be pleased to:"),
    {
      kind: "list",
      items: [
        "grant interim relief as specified by the advocate [[LEGAL_REVIEW]];",
        "grant ad-interim relief in terms of prayer (a) pending the hearing of this application;",
        "pass such other orders as this Court deems fit.",
      ],
    },
    p("Affidavit in support / verification in the prescribed form.", true),
    {
      kind: "signature",
      lines: [`Place: ${input.court.place}`, `Date: ${formatDateIN(input.filingDate)}`, "", "Authorised Officer, for the Plaintiff", "", "Advocate for the Plaintiff"],
    },
  ];

  return {
    templateId: "interim_application.en",
    version: 1,
    effectiveFrom: "2026-10-22",
    legalBasis: "CPC Orders XXXVIII r.5 / XXXIX rr.1–2 (to be selected); Commercial Courts Act 2015 s.12A",
    title: "",
    meta: [],
    to: [],
    blocks,
  };
}

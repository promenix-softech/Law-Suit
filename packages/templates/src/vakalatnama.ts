import { caption, type CaptionInput } from "./caption";
import { BLANK, joinAnd, type OfficeProfile } from "./format";
import type { DocModel } from "./model";

export interface VakalatnamaInput extends CaptionInput {
  /** The advocates' office; blanks are printed for anything not configured. */
  office?: OfficeProfile | null;
}

/**
 * Vakalatnama by the Plaintiff bank in the office's format: exhibit number box, short
 * caption, appointment of the firm and its advocates, the firm's block (code, sanad no.,
 * address, contact), witness and acceptance. Stamps are affixed by hand in the margin.
 */
export function buildVakalatnama(input: VakalatnamaInput): DocModel {
  const o = input.office;
  const appointees = [o?.firmName?.toUpperCase() ?? BLANK, ...(o?.advocates ?? [])];

  return {
    templateId: "vakalatnama.en",
    version: 2,
    effectiveFrom: "2026-10-26",
    legalBasis: "CPC Order III Rule 4; Maharashtra Advocates' Welfare Fund Act s.18(1); Court-fees Act Sch. II",
    title: "",
    meta: [],
    to: [],
    blocks: [
      { kind: "lines", align: "right", bold: true, lines: ["Exhibit No. ______"] },
      { kind: "lines", align: "center", bold: true, lines: ["VAKALATNAMA"] },
      ...caption(input, { full: false }),
      {
        kind: "para",
        text: `I / We, the undersigned ${input.bank.name}, ${input.bank.branch}, through its authorised officer, the Plaintiff above named, hereby appoint and authorise ${joinAnd(appointees)} to act, appear and plead for and on my/our behalf in the above matter.`,
      },
      {
        kind: "lines",
        align: "center",
        bold: true,
        lines: [
          o?.firmName?.toUpperCase() ?? BLANK,
          ...(o?.firmTagline ? [o.firmTagline.toUpperCase()] : []),
          ...(o?.advocateCode ? [`ADVOCATE CODE – ${o.advocateCode}`] : []),
          ...(o?.sanadNo ? [`(SANAD NO: ${o.sanadNo})`] : []),
        ],
      },
      {
        kind: "lines",
        lines: [
          `OFFICE: ${o?.address?.toUpperCase() ?? BLANK}`,
          `CONTACT No: ${o?.contact ?? BLANK}   MAIL ID – ${o?.email?.toUpperCase() ?? BLANK}`,
        ],
      },
      { kind: "lines", lines: ["*To appear, act and plead for me/us as my/our Advocate/s in the above matter.", "*In witness whereof I/we have signed below this vakalatnama."] },
      { kind: "sign2", left: ["Witness", "", `Accepted and filed on __/__/${input.year}`, "", "Signature of Advocate/s"], right: ["", "For the Plaintiff (Authorised Officer)"] },
      { kind: "spacer", lines: 0, note: "Affix the Advocates' Welfare Fund stamp and court-fee stamp in the margin" },
    ],
  };
}

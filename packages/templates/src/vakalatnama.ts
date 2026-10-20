import { caption, type CaptionInput } from "./caption";
import type { DocModel } from "./model";

export interface VakalatnamaInput extends CaptionInput {
  /** Advocate(s) being appointed; blank lines are printed when unknown. */
  advocates?: { name: string; enrolmentNo?: string | null }[];
  /** Stamp amounts in rupees. Statute says ₹20 welfare stamp; confirm with the Bar Council. */
  welfareStampRupees?: number;
  courtFeeStampRupees?: number;
}

/**
 * Vakalatnama by the Plaintiff bank appointing its advocates. The powers clause differs from
 * office to office, so it is left flagged for the advocate to replace with their standard text.
 */
export function buildVakalatnama(input: VakalatnamaInput): DocModel {
  const welfare = input.welfareStampRupees ?? 20;
  const courtFee = input.courtFeeStampRupees ?? 10;
  const advocates = input.advocates?.length ? input.advocates : [{ name: "____________________", enrolmentNo: null }];
  const names = advocates.map((a) => a.name).join(", ");

  return {
    templateId: "vakalatnama.en",
    version: 1,
    effectiveFrom: "2026-10-20",
    legalBasis: "CPC Order III Rule 4; Maharashtra Advocates' Welfare Fund Act s.18(1); Court-fees Act Sch. II",
    title: "VAKALATNAMA",
    meta: [],
    to: [],
    blocks: [
      { kind: "boxes", items: [`Advocates' Welfare Fund stamp ₹${welfare}`, `Court-fee stamp ₹${courtFee}`] },
      {
        kind: "para",
        legalReview: true,
        text: `Stamp amounts (welfare stamp ₹${welfare}, court-fee stamp ₹${courtFee}) to be confirmed for this court before use.`,
      },
      ...caption(input, { addresses: false }),
      {
        kind: "para",
        text: `We, ${input.bank.name}, ${input.bank.branch}, the Plaintiff above named, acting through our authorised officer, do hereby appoint and retain ${names}, Advocate(s), to appear, act and plead for us in the above suit and in all proceedings arising from it.`,
      },
      {
        kind: "para",
        legalReview: true,
        text: "Powers conferred on the Advocate(s) — to file pleadings, affidavits and applications, to receive and withdraw documents and moneys, to engage other advocates, and to compromise — as per the office's standard vakalatnama.",
      },
      {
        kind: "para",
        text: `In witness whereof we have signed this vakalatnama at ${input.court.place} on this ____ day of ______________ ${input.year}.`,
      },
      {
        kind: "signature",
        lines: ["", "Executant", `For ${input.bank.name}`, "Name: ____________________", "Designation: ______________", "(Seal of the Bank)"],
      },
      { kind: "heading", text: "Accepted" },
      {
        kind: "list",
        items: advocates.map((a) => `${a.name} — Enrolment No. ${a.enrolmentNo ?? "____________"} — Signature: ____________`),
      },
      { kind: "para", text: "Address for service: ______________________________________" },
    ],
  };
}

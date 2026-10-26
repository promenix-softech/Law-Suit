import { formatRs, rupeesInWords, type Paise } from "@civil-suits/domain";
import { bankConstitution, partyList, type Defendant } from "./caption";
import { BLANK, formatDateDot, joinAnd, pctBps, type OfficeProfile } from "./format";
import type { Block, DocModel } from "./model";
import type { Facility } from "./plaint";

export interface DemandNoticeInput {
  noticeDate: string; // ISO date
  /** Printed only when the office numbers its notices. */
  refNo?: string | null;
  office: OfficeProfile | null;
  bank: { name: string; branch: string; address?: string | null };
  defendants: Defendant[];
  facilities: Facility[];
  npaDate: string | null;
  /** Total dues demanded (A + B + C, from particularsOfClaim) and the date they are worked out to. */
  claimPaise: Paise;
  claimAsOn: string;
  /** Days given to pay; the office gives 7 (not statutory). */
  paymentDays: number;
  isCommercial: boolean;
}

/** DD-MM-YYYY, the format used in Maharashtra court papers. */
export function formatDateIN(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) throw new RangeError(`Invalid date: ${iso}`);
  return `${d}-${m}-${y}`;
}

const nums = (defendants: Defendant[], role: Defendant["role"]) =>
  defendants.flatMap((d, i) => (d.role === role ? [String(i + 1)] : []));

/** "the Addressee No. 1 is the Borrower and the Addressees No. 2 and 3 are the Guarantors". */
function rolesSentence(defendants: Defendant[]): string {
  const part = (role: Defendant["role"], one: string, many: string) => {
    const n = nums(defendants, role);
    if (!n.length) return null;
    return n.length === 1 ? `the Addressee No. ${n[0]} is the ${one}` : `the Addressees No. ${joinAnd(n)} are the ${many}`;
  };
  return joinAnd(
    [part("borrower", "Borrower", "Borrowers"), part("co_borrower", "Co-Borrower", "Co-Borrowers"), part("guarantor", "Guarantor", "Guarantors")].filter(
      (s): s is string => !!s,
    ),
  );
}

/**
 * Demand (loan recall) notice in the office's format, on its letterhead: addressees as in the
 * caption, the bank and its constitution, the facilities table, execution of documents,
 * default and NPA, the demand within the period, consequences, and the notice fee. Civil-suit
 * route — distinct from a SARFAESI 13(2) notice. All amounts arrive computed in code.
 */
export function buildDemandNotice(input: DemandNoticeInput): DocModel {
  const { bank, office, facilities: fs } = input;
  if (input.defendants.length === 0) throw new Error("At least one borrower is required");
  if (!fs.length) throw new Error("At least one loan facility is required");
  if (!Number.isInteger(input.paymentDays) || input.paymentDays < 1) throw new RangeError("paymentDays must be ≥ 1");

  const constitution = bankConstitution(bank.name);
  const many = fs.length > 1;
  let n = 0;
  const p = (text: string, legalReview = false): Block => ({ kind: "para", text: `${++n}. ${text}`, legalReview });
  const fee = office?.noticeFeeRupees;

  const blocks: Block[] = [
    { kind: "lines", align: "right", bold: true, lines: [...(input.refNo ? [`Ref.: ${input.refNo}`] : []), `Date: ${formatDateDot(input.noticeDate)}`] },
    { kind: "lines", align: "center", bold: true, lines: ["DEMAND NOTICE"] },
    { kind: "lines", lines: ["To,"] },
    ...partyList(input.defendants, { addresses: true }),
    { kind: "para", text: "Sir/Madam," },
    {
      kind: "para",
      text:
        `We are concerned for our client ${bank.name.toUpperCase()}, ` +
        (constitution ? `${constitution[0]!.toLowerCase()}${constitution.slice(1)}, ` : "") +
        `having its branch at ${bank.branch}${bank.address?.trim() ? `, ${bank.address.trim()}` : ""}, and on its instructions and the documents and information supplied to us, we have to serve upon you a legal notice as under:`,
    },
    p(`Our client states that ${rolesSentence(input.defendants)} for the credit ${many ? "facilities" : "facility"} sanctioned by our client Bank.`),
    p(`Our client further states that you approached our client Bank and requested the credit ${many ? "facilities" : "facility"} set out below, which our client Bank duly considered and sanctioned. The details of the sanction are as under:`),
    {
      kind: "table",
      head: ["Facility", "Amount", "Rate of Interest", "Tenure", "A/c No."],
      widths: [30, 18, 14, 14, 24],
      rows: fs.map((f) => [
        `${f.facilityType}${f.purpose ? ` (${f.purpose})` : ""}`,
        f.sanctionAmountPaise != null ? formatRs(f.sanctionAmountPaise) : BLANK,
        f.rateBps != null ? pctBps(f.rateBps) : BLANK,
        f.tenureMonths ? `${f.tenureMonths} Months` : "N.A.",
        f.accountNo ?? BLANK,
      ]),
    },
    p(
      `Our client states that you signed and executed the requisite loan and security documents in favour of our client to secure the repayment of the said ${many ? "facilities" : "facility"}, and by signing them you acknowledged and admitted your liability in favour of our client.`,
    ),
    p(
      `Our client states that the said loan ${many ? "accounts have" : "account has"} not been conducted as per the terms of sanction and the loan documents executed by you. The requests and reminders given by the officials of our client to clear the overdue amounts have not been responded to by you. In view of the defaults committed by you in payment of the dues, your loan ${many ? "accounts were" : "account was"} classified as NPA on ${input.npaDate ? formatDateDot(input.npaDate) : BLANK} as per the RBI guidelines.`,
    ),
    p(
      `You, the Addressees, are hereby called upon to pay to our client the total outstanding dues of ${formatRs(input.claimPaise)} (${rupeesInWords(input.claimPaise)})${input.defendants.length > 1 ? ", jointly and severally," : ""} as on ${formatDateDot(input.claimAsOn)}, with further interest at the contractual rate and other applicable charges till its actual realisation, within ${input.paymentDays} days from the date of receipt of this notice.`,
    ),
    p(
      "If you fail to repay the aforesaid amount within the above stated period, our client will be constrained to take appropriate legal action against you, including attachment and sale of the secured assets as well as your other properties, for recovery of the aforesaid outstanding amount together with future interest till its realisation. In that case you will be held responsible for the costs and consequences thereof.",
    ),
  ];

  if (input.isCommercial) {
    blocks.push(
      p(
        "As the claim is a commercial dispute of specified value, our client is also willing to participate in pre-institution mediation under Section 12A of the Commercial Courts Act, 2015, should you wish to settle the matter.",
        true,
      ),
    );
  }

  blocks.push(
    p(
      `${fee ? `Our professional fees including expenses of ${formatRs(fee * 100)} for issuing this loan recall notice` : "Our professional fees and expenses for issuing this loan recall notice"} will have to be borne by you. No further notice will be issued in this respect, and this notice is without prejudice to our client's rights to proceed under the law simultaneously.`,
    ),
    { kind: "signature", lines: ["", `For ${office?.firmName ?? "Advocates for the Bank"}${office?.firmTagline ? ` — ${office.firmTagline}` : ""}`] },
  );

  return {
    templateId: "demand_notice.en",
    layout: "letter",
    version: 2,
    effectiveFrom: "2026-10-26",
    legalBasis: "No statutory form; office format (civil recovery, not SARFAESI 13(2))",
    title: "",
    meta: [],
    to: [],
    letterhead: office
      ? [
          office.firmName.toUpperCase(),
          ...(office.firmTagline ? [office.firmTagline] : []),
          ...(office.address ? [office.address] : []),
          ...(office.email ? [`E-mail: ${office.email}`] : []),
          ...(office.contact ? [`Contact: ${office.contact}`] : []),
        ]
      : undefined,
    blocks,
  };
}

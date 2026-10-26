import { formatRs, rupeesInWords, type Paise } from "@civil-suits/domain";
import { bankConstitution, caption, courtLine, suitNoLine, type CaptionInput } from "./caption";
import { BLANK, formatDateDot, joinAnd, type OfficeProfile } from "./format";
import { alphaMark, type Block, type DocModel } from "./model";
import { causeOfAction, type Facility, type PlaintInput } from "./plaint";

const doc = (templateId: string, legalBasis: string, rest: Partial<DocModel> & Pick<DocModel, "blocks">): DocModel => ({
  templateId,
  version: 1,
  effectiveFrom: "2026-10-26",
  legalBasis,
  title: "",
  meta: [],
  to: [],
  ...rest,
});

const borrowerOf = (input: CaptionInput) => {
  const b = input.defendants[0]!;
  return `${b.name.toUpperCase()}${b.through ? ` through its ${b.through.capacity} ${b.through.name.toUpperCase()}` : ""}`;
};
const accountsOf = (fs: Facility[]) => joinAnd(fs.map((f) => f.accountNo ?? BLANK));

/** Address memo (pursis): the addresses in the plaint's caption are correct. Full caption. */
export function buildAddressMemo(input: CaptionInput): DocModel {
  return doc("address_memo.en", "Civil Manual (Bombay HC) — address memo filed with the plaint; office format", {
    runningHeader: "ADDRESS MEMO",
    pageNumbers: true,
    blocks: [
      ...caption(input),
      { kind: "lines", align: "center", bold: true, lines: ["ADDRESS MEMO"] },
      { kind: "para", text: "PURSIS filed on behalf of the Plaintiff is as under:" },
      {
        kind: "para",
        text: "That the addresses of the Plaintiff and the Defendants mentioned in the cause title of the plaint are true and correct as per the knowledge of the Plaintiff.",
      },
      { kind: "para", text: "Hence this memo." },
      { kind: "lines", lines: [`Place: ${input.court.place}`, `Date: __/__/${input.year}`] },
      { kind: "sign2", left: ["", "Adv. for Plaintiff"], right: ["", "Plaintiff"] },
    ],
  });
}

export interface DocumentEntry {
  title: string;
  /** Page numbers are written in once the bundle is paginated. */
  pages?: string | null;
}

/**
 * The office's standard list of documents for a bank-recovery suit, built from the case:
 * officer's ID and authority, then per facility the loan application and every executed
 * document, the demand notice, the 12A report, the BBE certificate and the account statement.
 */
export function standardDocuments(input: Pick<PlaintInput, "facilities" | "notice" | "mediation" | "suitType">): DocumentEntry[] {
  const out: DocumentEntry[] = [
    { title: "Photocopy of identity proof of the authorised officer of the Plaintiff bank." },
    { title: "Photocopy of authority letter / power of attorney in favour of the authorised officer of the Plaintiff bank." },
  ];
  for (const f of input.facilities) {
    const amt = f.sanctionAmountPaise != null ? ` for ${formatRs(f.sanctionAmountPaise)}` : "";
    out.push({ title: `Photocopy of loan application form${amt}${f.applicationDate ? ` dated ${formatDateDot(f.applicationDate)}` : ""}.` });
    for (const d of f.documents ?? []) out.push({ title: `Photocopy of ${d.title}${d.date ? ` dated ${formatDateDot(d.date)}` : ""}.` });
  }
  if (input.notice) out.push({ title: `Photocopy of demand notice through the Plaintiff's advocate dated ${formatDateDot(input.notice.date)}, with proof of dispatch.` });
  if (input.suitType === "commercial" && input.mediation) out.push({ title: `Section 12A mediation report dated ${formatDateDot(input.mediation.reportDate)}.` });
  out.push(
    { title: "Certificate under the Bankers' Books Evidence Act, 1891." },
    { title: `Account statement of loan account no. ${accountsOf(input.facilities)}.` },
  );
  return out;
}

/** List of documents with annexure marks A, B, C … in the office's format. Short caption. */
export function buildListOfDocuments(input: CaptionInput & { entries: DocumentEntry[] }): DocModel {
  if (!input.entries.length) throw new Error("The list of documents is empty");
  return doc("list_of_documents.en", "CPC Order VII Rule 14; office format", {
    pageNumbers: true,
    blocks: [
      ...caption(input, { full: false }),
      { kind: "lines", align: "center", bold: true, lines: ["LIST OF DOCUMENTS"] },
      { kind: "para", text: "The following documents are submitted on behalf of the Plaintiff in connection with the present matter." },
      {
        kind: "table",
        head: ["Sr. No.", "Particulars", "Annexure", "Page No."],
        widths: [10, 60, 17, 13],
        rows: input.entries.map((e, i) => [`${i + 1}.`, e.title, `Annexure ${alphaMark(i).toUpperCase()}`, e.pages ?? ""]),
      },
      { kind: "para", text: `Total documents submitted on behalf of the Plaintiff: ${input.entries.length}.` },
      { kind: "lines", lines: [`PLACE: ${input.court.place.toUpperCase()}`, `DATE: __/__/${input.year}`] },
      { kind: "sign2", left: ["", "ADV. FOR PLAINTIFF"], right: ["", "PLAINTIFF"] },
    ],
  });
}

/**
 * Certificate for computer print-outs of the loan account, signed at the branch. Wording as the
 * office uses it; the particulars Section 2A(b) and (c) also call for are flagged.
 */
export function buildBbeCertificate(input: CaptionInput & { facilities: Facility[]; place: string; year: number }): DocModel {
  const { bank } = input;
  return doc("bbe_certificate.en", "Bankers' Books Evidence Act 1891 s.2A [[LEGAL_REVIEW]] (confirm Act in force for the filing date)", {
    layout: "letter",
    blocks: [
      { kind: "lines", align: "center", bold: true, lines: [`${bank.name.toUpperCase()},`, bank.branch.toUpperCase()] },
      { kind: "lines", align: "center", bold: true, lines: ["C E R T I F I C A T E", "(Under Section 2A of the Bankers' Books Evidence Act, 1891)"] },
      {
        kind: "para",
        text: `This is to certify that, to the best of my knowledge and belief, the computer system is operated properly and the print-out of the loan account of ${borrowerOf(input)}, Loan A/c No. ${accountsOf(input.facilities)}, is appropriately derived from the relevant data at ${bank.name}, ${bank.branch}${bank.address?.trim() ? ` (Address: ${bank.address.trim()})` : ""}.`,
      },
      {
        kind: "para",
        legalReview: true,
        text: "Section 2A(b) and (c) particulars — brief description of the computer system and of the safeguards against unauthorised access and alteration, by the person in charge of the system — to be confirmed with the bank's standard certificate.",
      },
      { kind: "sign2", left: [`Date: __/__/${input.year}`, `Place: ${input.place}`], right: ["", "Authorised Signatory", `(${bank.name}, ${bank.branch})`] },
    ],
  });
}

export interface CourtFeeLetterInput {
  refNo: string;
  date: string;
  bank: CaptionInput["bank"];
  borrower: string;
  claimPaise: Paise;
  courtFeePaise: Paise;
  courtFeeAct: string;
  office?: OfficeProfile | null;
}

/** Letter asking the bank to remit the court fee before filing (the office's "stamp" letter). */
export function buildCourtFeeLetter(input: CourtFeeLetterInput): DocModel {
  const acc = input.office?.feeAccount;
  const rows: [string, string][] = [
    ["Account Name", acc?.accountName ?? BLANK],
    ["A/c No.", acc?.accountNo ?? BLANK],
    ["Account Type", acc?.accountType ?? BLANK],
    ["Bank", acc?.bank ?? BLANK],
    ["Branch", acc?.branch ?? BLANK],
    ["IFSC Code", acc?.ifsc ?? BLANK],
    ...(input.office?.pan ? ([["PAN No.", input.office.pan]] as [string, string][]) : []),
  ];
  return doc("court_fee_letter.en", `${input.courtFeeAct} Sch. I Art. 1 (fee computed in code)`, {
    layout: "letter",
    meta: [input.refNo, `DATE: ${formatDateDot(input.date).replaceAll(".", "/")}`],
    to: ["The Branch Manager,", `${input.bank.name},`, input.bank.branch],
    blocks: [
      { kind: "para", text: "Sir," },
      {
        kind: "para",
        text: `To proceed with the filing of the civil suit against your borrower, ${input.borrower}, for the total claim amount of ${formatRs(input.claimPaise)}, the court fee (stamp duty) payable under the ${input.courtFeeAct} is ${formatRs(input.courtFeePaise)} (${rupeesInWords(input.courtFeePaise)}).`,
      },
      { kind: "lines", bold: true, lines: [`TOTAL COURT FEE (STAMP DUTY): ${formatRs(input.courtFeePaise)}`] },
      { kind: "para", text: "Kindly remit the payment at your earliest convenience to the account mentioned below:" },
      { kind: "fields", rows },
      { kind: "signature", lines: ["", input.office?.firmName?.toUpperCase() ?? "Advocates for the Bank"] },
    ],
  });
}

const NATIONALISED = /Act, 19(70|80)/;

/**
 * Data sheet for the eCourts e-filing portal ("public data entry"): every field the clerk types
 * in, filled from the case — including the amount and valuation, which are easy to leave at 0.
 */
export function buildEfilingSheet(input: PlaintInput): DocModel {
  const claim = input.claim.totalPaise;
  const summary = input.suitType === "summary_o37";
  const caseType = summary ? "Summary Suit" : input.suitType === "commercial" ? "Commercial Suit" : "Civil Suit";
  const constitution = bankConstitution(input.bank.name);
  const orgType = constitution && NATIONALISED.test(constitution) ? "Nationalised Banks" : BLANK;
  const amount = formatRs(claim).replace(/^Rs\. /, "").replace(/\/-$/, "");
  return doc("efiling_sheet.en", "eCourts e-filing portal — case data entry (not filed)", {
    layout: "letter",
    title: "E-FILING DATA SHEET",
    blocks: [
      { kind: "para", text: "For entering the case on the e-filing portal. Not to be filed. Check every field against the plaint before submitting." },
      { kind: "heading", text: "Case" },
      {
        kind: "fields",
        rows: [
          ["Establishment", courtLine(input.court)],
          ["Case number line", suitNoLine(input)],
          ["Case type / Relief sought", caseType],
          ["Act", "CODE OF CIVIL PROCEDURE"],
          ["Section", summary ? "Order 37" : BLANK],
          ["Date of cause of action", input.npaDate ? formatDateDot(input.npaDate).replaceAll(".", "-") : BLANK],
          ["Valuation", amount],
          ["Amount", amount],
          ["Court fee", input.courtFeePaise != null ? formatRs(input.courtFeePaise) : BLANK],
          ["Plaint in local language", "No"],
        ],
      },
      { kind: "heading", text: "Plaintiff" },
      {
        kind: "fields",
        rows: [
          ["Name", `${input.bank.name.toUpperCase()}, ${input.bank.branch.toUpperCase()}`],
          ["Organisation type", orgType],
          ["Address", input.bank.address?.toUpperCase() ?? BLANK],
        ],
      },
      { kind: "heading", text: "Defendants" },
      {
        kind: "table",
        head: ["No.", "Name", "Address"],
        widths: [8, 42, 50],
        rows: input.defendants.map((d, i) => [
          String(i + 1),
          `${d.name.toUpperCase()}${d.through ? ` Through its ${d.through.capacity} ${d.through.name.toUpperCase()}` : ""}`,
          d.address?.toUpperCase() ?? BLANK,
        ]),
      },
      { kind: "heading", text: "Cause of action (English)" },
      { kind: "para", text: causeOfAction(input) },
      { kind: "heading", text: "Relief claimed" },
      { kind: "para", text: `The amount of ${formatRs(claim)} with interest and costs may kindly be recovered from the Defendants.` },
      { kind: "heading", text: "केलेली मागणी (Marathi)" },
      { kind: "para", text: `प्रतिवादीकडून रक्कम रु. ${amount}/- व्याज व खर्चासह वसूल होऊन मिळावी, ही विनंती.` },
      ...(input.urgentInterimRelief ? ([{ kind: "para", legalReview: true, text: "Urgent interim relief sought — mark it on the portal." }] as Block[]) : []),
    ],
  });
}

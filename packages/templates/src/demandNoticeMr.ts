import { formatRs, rupeesInWordsMr, toDevanagariDigits, type Paise } from "@civil-suits/domain";
import type { Defendant, PartyRole } from "./caption";
import type { DemandNoticeInput } from "./demandNotice";
import { BLANK, formatDateDot, pctBps } from "./format";
import type { Block, DocModel } from "./model";

/**
 * Demand (loan recall) notice in Marathi: the office's English notice, paragraph for paragraph,
 * in the usual shape of a Marathi advocate's notice (प्रति … विषय … महोदय … कळावे). Terms follow
 * the marathi-legal-glossary skill. Rules kept here:
 *  - a party's name and address are printed in Marathi when a person has typed the Marathi
 *    form on the case (Defendant.nameMr / addressMr); otherwise, and for facility purposes and
 *    the firm's name, the bank's records are printed as they are — code never transliterates;
 *  - every digit in the notice is a Devanagari digit (the owner's choice, 11 Nov 2026): dates,
 *    amounts, rates, paragraph and account numbers, PIN codes; the amount in words comes from
 *    rupeesInWordsMr();
 *  - common facility names and the letterhead labels are printed in Marathi; anything else the
 *    bank wrote is printed as written;
 *  - an Act is named in Marathi with its English short title in brackets, in a paragraph
 *    flagged for review (no Marathi statute title is relied on unchecked);
 *  - the bank's constitution clause of the English notice is left out (it cites an Act).
 * The wording has not yet been settled by the advocate: the notice opens with a highlighted
 * [[LEGAL_REVIEW]] line that must be removed by whoever approves the text.
 */

const ROLE_MR: Record<PartyRole, [one: string, suffix: string]> = {
  borrower: ["कर्जदार", ""],
  co_borrower: ["सह-कर्जदार", " (सह-कर्जदार)"],
  guarantor: ["जामीनदार", " (जामीनदार)"],
};

/** Capacities the office writes in English; anything else is printed as entered. */
const CAPACITY_MR: Record<string, string> = {
  proprietor: "मालक",
  proprietress: "मालक",
  partner: "भागीदार",
  director: "संचालक",
  "managing director": "व्यवस्थापकीय संचालक",
  "authorised signatory": "अधिकृत स्वाक्षरीकर्ता",
  "authorized signatory": "अधिकृत स्वाक्षरीकर्ता",
  karta: "कर्ता",
};

/** "a, b व c". */
export function joinVa(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} व ${items[items.length - 1]}`;
}

/** "रु. 9,50,000/-" from the pleading-style English figure. */
const rs = (paise: Paise): string => formatRs(paise).replace(/^Rs\./, "रु.");

const up = (s: string) => s.trim().toUpperCase();

/** Facility names banks use everywhere; a name not listed is printed as the bank wrote it. */
const FACILITY_MR: Record<string, string> = {
  "term loan": "मुदत कर्ज",
  "cash credit": "कॅश क्रेडिट",
  overdraft: "ओव्हरड्राफ्ट",
  "home loan": "गृह कर्ज",
  "housing loan": "गृह कर्ज",
  "vehicle loan": "वाहन कर्ज",
  "car loan": "वाहन कर्ज",
  "personal loan": "वैयक्तिक कर्ज",
  "education loan": "शैक्षणिक कर्ज",
  "gold loan": "सोने तारण कर्ज",
  "crop loan": "पीक कर्ज",
  "kisan credit card": "किसान क्रेडिट कार्ड",
  "mudra loan": "मुद्रा कर्ज",
  "business loan": "व्यवसाय कर्ज",
  loan: "कर्ज",
};
const facilityName = (name: string) => FACILITY_MR[name.trim().toLowerCase()] ?? name.trim();

/** Devanagari digits in every line the notice prints. */
function digits(b: Block): Block {
  const d = toDevanagariDigits;
  switch (b.kind) {
    case "para":
    case "heading":
      return { ...b, text: d(b.text) };
    case "lines":
    case "center":
    case "signature":
      return { ...b, lines: b.lines.map(d) };
    case "table":
      return { ...b, head: b.head.map(d), rows: b.rows.map((r) => r.map(d)) };
    case "list":
    case "boxes":
      return { ...b, items: b.items.map(d) };
    case "fields":
      return { ...b, rows: b.rows.map(([k, v]): [string, string] => [d(k), d(v)]) };
    case "sign2":
      return { ...b, left: b.left.map(d), right: b.right.map(d) };
    default:
      return b;
  }
}

function addressees(defendants: Defendant[]): Block[] {
  const multi = defendants.length > 1;
  return defendants.flatMap((d, i): Block[] => {
    const blocks: Block[] = [{ kind: "lines", bold: true, lines: [`${multi ? `${i + 1}. ` : ""}${d.nameMr?.trim() || up(d.name)}${ROLE_MR[d.role][1]}`] }];
    if (d.through) {
      const capacity = CAPACITY_MR[d.through.capacity.trim().toLowerCase()] ?? d.through.capacity.trim();
      blocks.push({ kind: "lines", bold: true, indent: true, lines: [`तर्फे ${capacity}`, d.through.nameMr?.trim() || up(d.through.name)] });
    }
    blocks.push({ kind: "lines", indent: multi, lines: [`पत्ता: ${d.addressMr?.trim() || (d.address?.trim() ? up(d.address) : BLANK)}`] });
    return blocks;
  });
}

/** "नोटीस घेणार क्र. 1 हे कर्जदार आहेत आणि नोटीस घेणार क्र. 2 व 3 हे जामीनदार आहेत". */
function rolesSentence(defendants: Defendant[]): string {
  const part = (role: PartyRole) => {
    const n = defendants.flatMap((d, i) => (d.role === role ? [String(i + 1)] : []));
    return n.length ? `नोटीस घेणार क्र. ${joinVa(n)} हे ${ROLE_MR[role][0]} आहेत` : null;
  };
  const parts = [part("borrower"), part("co_borrower"), part("guarantor")].filter((s): s is string => !!s);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} आणि ${parts[parts.length - 1]}`;
}

export function buildDemandNoticeMr(input: DemandNoticeInput): DocModel {
  const { bank, office, facilities: fs } = input;
  if (input.defendants.length === 0) throw new Error("At least one borrower is required");
  if (!fs.length) throw new Error("At least one loan facility is required");
  if (!Number.isInteger(input.paymentDays) || input.paymentDays < 1) throw new RangeError("paymentDays must be ≥ 1");

  const many = fs.length > 1;
  const facility = many ? "कर्ज सुविधांच्या" : "कर्ज सुविधेच्या";
  const account = many ? "कर्ज खाती" : "कर्ज खाते";
  let n = 0;
  const p = (text: string, legalReview = false): Block => ({ kind: "para", text: `${++n}. ${text}`, legalReview });
  const fee = office?.noticeFeeRupees;

  const blocks: Block[] = [
    {
      kind: "para",
      legalReview: true,
      text: "मराठी मसुदा (दुसरा नमुना): या नोटिशीची शब्दरचना वकिलांनी तपासून मंजूर करायची आहे. मंजुरीनंतर ही ओळ काढून टाकावी.",
    },
    {
      kind: "lines",
      align: "right",
      bold: true,
      lines: [...(input.refNo ? [`संदर्भ क्र.: ${input.refNo}`] : []), `दिनांक: ${formatDateDot(input.noticeDate)}`],
    },
    { kind: "lines", align: "center", bold: true, lines: ["मागणी नोटीस"] },
    { kind: "lines", lines: ["प्रति,"] },
    ...addressees(input.defendants),
    { kind: "lines", bold: true, lines: ["विषय: थकबाकी रक्कम वसुलीबाबत मागणी नोटीस."] },
    { kind: "para", text: "महोदय / महोदया," },
    {
      kind: "para",
      text:
        `आमचे अशील ${bank.name.toUpperCase()}, शाखा ${bank.branch}${bank.address?.trim() ? `, ${bank.address.trim()}` : ""}, ` +
        "यांनी दिलेल्या सूचना, कागदपत्रे व माहिती यांच्या आधारे आम्ही आपणांस ही कायदेशीर नोटीस खालीलप्रमाणे देत आहोत:",
    },
    p(`आमचे अशील कळवितात की, आमच्या अशील बँकेने मंजूर केलेल्या ${facility} संदर्भात ${rolesSentence(input.defendants)}.`),
    p(
      `आमचे अशील पुढे कळवितात की, आपण आमच्या अशील बँकेकडे खाली नमूद ${many ? "कर्ज सुविधांची" : "कर्ज सुविधेची"} मागणी केली आणि आमच्या अशील बँकेने ती विचारात घेऊन मंजूर केली. मंजुरीचा तपशील खालीलप्रमाणे आहे:`,
    ),
    {
      kind: "table",
      head: ["कर्ज सुविधा", "रक्कम", "व्याजदर", "मुदत", "खाते क्र."],
      widths: [30, 18, 14, 14, 24],
      rows: fs.map((f) => [
        `${facilityName(f.facilityType)}${f.purpose ? ` (${f.purpose})` : ""}`,
        f.sanctionAmountPaise != null ? rs(f.sanctionAmountPaise) : BLANK,
        f.rateBps != null ? pctBps(f.rateBps) : BLANK,
        f.tenureMonths ? `${f.tenureMonths} महिने` : "लागू नाही",
        f.accountNo ?? BLANK,
      ]),
    },
    p(
      `आमचे अशील कळवितात की, सदर ${facility} परतफेडीच्या हमीसाठी आपण आमच्या अशिलांच्या नावे आवश्यक ती कर्ज व तारण कागदपत्रे सही करून दिली आहेत आणि त्याद्वारे आमच्या अशिलांप्रती असलेली आपली जबाबदारी आपण मान्य व कबूल केली आहे.`,
    ),
    p(
      `आमचे अशील कळवितात की, सदर ${account} मंजुरीच्या अटींनुसार व आपण सही करून दिलेल्या कर्ज कागदपत्रांनुसार चालविण्यात ${many ? "आली नाहीत" : "आले नाही"}. थकीत रक्कम भरण्याबाबत आमच्या अशिलांच्या अधिकाऱ्यांनी केलेल्या विनंत्यांना व स्मरणपत्रांना आपण प्रतिसाद दिलेला नाही. आपण देय रकमेचा भरणा करण्यात कसूर केल्यामुळे ${many ? "आपली" : "आपले"} ${account} रिझर्व्ह बँकेच्या मार्गदर्शक सूचनांनुसार दिनांक ${input.npaDate ? formatDateDot(input.npaDate) : BLANK} रोजी अनुत्पादक मालमत्ता (एनपीए) म्हणून वर्गीकृत करण्यात ${many ? "आली आहेत" : "आले आहे"}.`,
    ),
    p(
      `म्हणून या नोटिशीद्वारे आपणांस कळविण्यात येते की, ही नोटीस मिळाल्यापासून ${input.paymentDays} दिवसांचे आत आपण${input.defendants.length > 1 ? " सर्वांनी संयुक्तपणे व वैयक्तिकरीत्या" : ""} आमच्या अशिलांस दिनांक ${formatDateDot(input.claimAsOn)} रोजीची एकूण थकबाकी रक्कम ${rs(input.claimPaise)} (अक्षरी ${rupeesInWordsMr(input.claimPaise)}), तसेच त्यावर प्रत्यक्ष वसुली होईपर्यंत करारानुसार होणारे पुढील व्याज व इतर लागू शुल्क, भरावे.`,
    ),
    p(
      "वरील मुदतीत आपण सदर रकमेचा भरणा न केल्यास, सदर थकबाकी रक्कम पुढील व्याजासह वसूल करण्यासाठी आमच्या अशिलांना आपणांविरुद्ध योग्य ती कायदेशीर कारवाई करणे भाग पडेल; त्यामध्ये तारण मालमत्तेची तसेच आपल्या इतर मालमत्तांची जप्ती व विक्री यांचा समावेश असेल. त्या परिस्थितीत होणाऱ्या खर्चाची व परिणामांची संपूर्ण जबाबदारी आपणांवर राहील.",
    ),
  ];

  if (input.isCommercial) {
    blocks.push(
      p(
        "सदर मागणी विनिर्दिष्ट मूल्याचा वाणिज्यिक वाद असल्याने, आपण हे प्रकरण मिटवू इच्छित असल्यास आमचे अशील वाणिज्यिक न्यायालये अधिनियम, 2015 (Commercial Courts Act, 2015) च्या कलम 12-अ अन्वये दावापूर्व मध्यस्थीत सहभागी होण्यास तयार आहेत.",
        true,
      ),
    );
  }

  blocks.push(
    p(
      `${fee ? `ही नोटीस देण्यासाठी आलेले आमचे व्यावसायिक शुल्क व खर्च ${rs(fee * 100)}` : "ही नोटीस देण्यासाठी आलेले आमचे व्यावसायिक शुल्क व खर्च"} आपणांस सोसावा लागेल. या संदर्भात यापुढे कोणतीही नोटीस दिली जाणार नाही. ही नोटीस आमच्या अशिलांच्या, कायद्यानुसार एकाच वेळी इतर कार्यवाही करण्याच्या हक्कांस बाधा न येता देण्यात येत आहे.`,
    ),
    { kind: "para", text: "कळावे," },
    { kind: "signature", lines: ["", `${office?.firmName ?? "बँकेचे वकील"} करिता`] },
  );

  return {
    templateId: "demand_notice.mr",
    layout: "letter",
    version: 2,
    effectiveFrom: "2026-11-11",
    legalBasis:
      "No statutory form; Marathi rendering of the office's demand notice (civil recovery, not SARFAESI 13(2)); wording pending the advocate's approval",
    title: "",
    meta: [],
    to: [],
    letterhead: office
      ? [
          office.firmName.toUpperCase(),
          ...(office.firmTagline ? [office.firmTagline] : []),
          ...(office.address ? [toDevanagariDigits(office.address)] : []),
          ...(office.email ? [`ई-मेल: ${office.email}`] : []),
          ...(office.contact ? [`संपर्क: ${toDevanagariDigits(office.contact)}`] : []),
        ]
      : undefined,
    blocks: blocks.map(digits),
  };
}

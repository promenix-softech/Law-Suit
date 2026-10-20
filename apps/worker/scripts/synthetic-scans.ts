/**
 * Synthetic "scanned" loan files for demos and OCR/extraction accuracy tests.
 * Each case = sanction letter, loan agreement extract, statement of account and NPA letter,
 * rendered to PDF, rasterised at 300 DPI with slight skew, noise and blur, then rebuilt as
 * an image-only PDF. `manifest.json` holds the expected value of every extraction field.
 *
 *   pnpm --filter @civil-suits/worker synthetic-scans [outDir] [count]
 *
 * Synthetic data only: fictional names, DEMO account numbers, fake IFSC.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { calculateInterest, formatINR, rupees } from "@civil-suits/domain";
import type { Block, DocModel } from "@civil-suits/templates";
import { renderDocx } from "@civil-suits/templates/docx";
import { docxToPdfA, withTempDir } from "../src/tools";

const outDir = resolve(process.argv[2] ?? "synthetic-scans");
const count = Math.min(Number(process.argv[3] ?? 10), 10);

const BORROWERS = [
  "Ramesh Demo Patil", "Sunita Test Kulkarni", "Vijay Sample Jadhav", "Meena Fake Deshmukh",
  "Prakash Demo Shinde", "Kavita Test Pawar", "Sanjay Sample More", "Anita Fake Gaikwad",
  "Mahesh Demo Bhosale", "Rekha Test Chavan",
];
const GUARANTORS = ["Suresh Demo Patil", "Anil Test Kulkarni", null, "Nitin Fake Deshmukh", null];
const BANKS = [
  { name: "State Bank of India", ifsc: "SBIN0DEMO01" },
  { name: "Union Bank of India", ifsc: "UBIN0DEMO02" },
  { name: "Punjab National Bank", ifsc: "PUNB0DEMO03" },
  { name: "Bank of Maharashtra", ifsc: "MAHB0DEMO04" },
];
const TOWNS = ["Pune", "Satara", "Kolhapur", "Nashik", "Ahmednagar"];
// Thresholds the skill asks fixtures to cover: < ₹1L, ₹3L, ₹10–11L slab, ≥ ₹20L (DRT).
const PRINCIPALS = [85_000, 3_00_000, 1_40_000, 10_50_000, 22_00_000, 4_75_000, 6_20_000, 8_90_000, 12_40_000, 2_60_000];
const FACILITIES = ["Term Loan", "Cash Credit", "Housing Loan", "Vehicle Loan", "Mudra Loan (Kishor)"];

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");
const addMonths = (iso: string, m: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
};

const page = (title: string, blocks: Block[]): DocModel => ({
  templateId: "synthetic.scan",
  version: 1,
  effectiveFrom: "2026-10-21",
  legalBasis: "none (synthetic fixture)",
  title,
  meta: ["SYNTHETIC — DEMO ONLY"],
  to: [],
  blocks,
});

function caseFile(i: number) {
  const bank = BANKS[i % BANKS.length]!;
  const town = TOWNS[i % TOWNS.length]!;
  const borrower = BORROWERS[i]!;
  const guarantor = GUARANTORS[i % GUARANTORS.length] ?? null;
  const sanctionDate = `20${21 + (i % 3)}-0${1 + (i % 9)}-${String(5 + i).padStart(2, "0")}`;
  const sanctionPaise = rupees(PRINCIPALS[i]!);
  const rateBps = 950 + (i % 5) * 75;
  const npaDate = addMonths(sanctionDate, 18 + i);
  const asOn = "2026-09-30";
  const outstanding = calculateInterest({ principalPaise: Math.round(sanctionPaise * 0.82), rateBps, from: npaDate, to: asOn, compounding: "simple" })
    .totalPaise;
  const account = `DEMO${String(4000 + i).padStart(6, "0")}${i}`;
  const branch = `${town} Demo Branch`;
  const address = `Plot ${10 + i}, Synthetic Nagar, ${town} 411 0${String(10 + i).padStart(2, "0")}`;
  const facility = FACILITIES[i % FACILITIES.length]!;

  const expected = {
    borrower_name: borrower,
    borrower_address: address,
    guarantor_name: guarantor,
    bank_name: bank.name,
    branch_name: branch,
    ifsc: bank.ifsc,
    loan_account_number: account,
    facility_type: facility,
    sanction_date: sanctionDate,
    sanction_amount_paise: sanctionPaise,
    interest_rate_bps: rateBps,
    npa_date: npaDate,
    outstanding_amount_paise: outstanding,
    outstanding_as_on: asOn,
  };

  const head: Block = { kind: "center", bold: true, lines: [bank.name.toUpperCase(), `${branch} · IFSC ${bank.ifsc}`] };
  const docs: DocModel[] = [
    page("SANCTION LETTER", [
      head,
      { kind: "fields", rows: [["Ref", `${bank.ifsc}/ADV/${2021 + (i % 3)}/${100 + i}`], ["Date", fmtDate(sanctionDate)]] },
      { kind: "signature", lines: ["To,", borrower, address] },
      {
        kind: "para",
        text: `We are pleased to inform you that a ${facility} of ${formatINR(sanctionPaise)} has been sanctioned to you at a rate of interest of ${(rateBps / 100).toFixed(2)}% per annum, repayable as per the terms of the loan agreement.`,
      },
      { kind: "fields", rows: [["Loan account no.", account], ["Facility", facility], ["Sanctioned amount", formatINR(sanctionPaise)], ["Rate of interest", `${(rateBps / 100).toFixed(2)}% p.a.`]] },
      { kind: "signature", lines: ["Branch Manager", branch] },
    ]),
    page("LOAN AGREEMENT (EXTRACT)", [
      head,
      { kind: "para", text: `This agreement is made at ${town} on ${fmtDate(sanctionDate)} between ${bank.name} ("the Bank") and ${borrower}, residing at ${address} ("the Borrower")${guarantor ? `, with ${guarantor} as Guarantor` : ""}.` },
      { kind: "list", items: ["The Borrower shall repay the loan with interest in monthly instalments.", "On default the Bank may recall the entire outstanding with interest.", "This is a synthetic document generated for software testing."] },
      { kind: "signature", lines: ["Borrower", ...(guarantor ? ["Guarantor"] : []), "For the Bank"] },
    ]),
    page("STATEMENT OF ACCOUNT", [
      head,
      { kind: "fields", rows: [["Account", account], ["Name", borrower], ["Period", `${fmtDate(sanctionDate)} to ${fmtDate(asOn)}`]] },
      {
        kind: "table",
        head: ["Date", "Particulars", "Debit", "Credit", "Balance"],
        widths: [16, 34, 16, 16, 18],
        rows: [
          [fmtDate(sanctionDate), "Loan disbursed", formatINR(sanctionPaise), "", formatINR(sanctionPaise)],
          [fmtDate(addMonths(sanctionDate, 6)), "EMI received", "", formatINR(Math.round(sanctionPaise * 0.18)), formatINR(Math.round(sanctionPaise * 0.82))],
          [fmtDate(npaDate), "Account classified NPA", "", "", formatINR(Math.round(sanctionPaise * 0.82))],
          [fmtDate(asOn), "Interest applied", formatINR(outstanding - Math.round(sanctionPaise * 0.82)), "", formatINR(outstanding)],
        ],
      },
      { kind: "fields", rows: [["Total outstanding as on " + fmtDate(asOn), formatINR(outstanding)]] },
    ]),
    page("NPA CLASSIFICATION NOTICE", [
      head,
      { kind: "para", text: `Dear ${borrower}, your loan account no. ${account} has been classified as a Non-Performing Asset on ${fmtDate(npaDate)} as per RBI norms. The amount outstanding as on ${fmtDate(asOn)} is ${formatINR(outstanding)}.` },
      { kind: "signature", lines: ["Branch Manager", branch] },
    ]),
  ];
  return { id: `SYN-${String(i + 1).padStart(2, "0")}`, expected, docs };
}

/** Rasterise at 300 DPI and degrade each page like a desk scanner would. */
function scanLike(pdf: string, dir: string, seed: number): string[] {
  const prefix = join(dir, `p${seed}`);
  execFileSync("gs", ["-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pnggray", "-r300", `-sOutputFile=${prefix}-%02d.png`, pdf]);
  return readdirSync(dir)
    .filter((f) => f.startsWith(`p${seed}-`) && f.endsWith(".png"))
    .sort()
    .map((f, k) => {
      const src = join(dir, f);
      const out = join(dir, `s${seed}-${k}.jpg`);
      const angle = (((seed * 7 + k * 3) % 11) - 5) / 6; // about ±0.8°
      execFileSync("convert", [
        src, "-background", "white", "-rotate", angle.toFixed(2),
        "-attenuate", "0.35", "+noise", "Gaussian", "-blur", "0x0.6",
        "-gravity", "center", "-extent", "2480x3508", "-density", "300", "-units", "PixelsPerInch",
        "-quality", "70", out,
      ]);
      return out;
    });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const manifest: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const c = caseFile(i);
    await withTempDir(async (dir) => {
      const pages: string[] = [];
      for (const [k, doc] of c.docs.entries()) {
        const pdf = await docxToPdfA(await renderDocx(doc), dir, `d${k}`);
        pages.push(...scanLike(pdf, dir, i * 10 + k));
      }
      const file = join(outDir, `${c.id}.pdf`);
      execFileSync("convert", [...pages, "-density", "300", "-compress", "jpeg", file]);
      manifest.push({ file: `${c.id}.pdf`, pages: pages.length, expected: c.expected });
      console.log(`${c.id}.pdf  ${pages.length} pages`);
    });
  }
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

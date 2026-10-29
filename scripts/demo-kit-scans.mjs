/**
 * Two synthetic "scanned" bank loan files for the live demo (upload → OCR → extraction → drafts).
 * Each page is rendered from HTML in Chromium, rasterised at 300 DPI with a slight skew, noise
 * and blur, and rebuilt as an image-only PDF, so the OCR path is exercised like a desk scan.
 *
 *   node scripts/demo-kit-scans.mjs [outDir]        (needs playwright, pdftoppm, ImageMagick)
 *
 * Synthetic data only: fictional names, DEMO account numbers, fake IFSC, invented amounts.
 * The statement balances are chained by hand below; `expected` in manifest.json is what the
 * extraction review should show.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

// CommonJS require also finds a globally installed playwright (NODE_PATH); ESM import does not.
const { chromium } = createRequire(import.meta.url)("playwright");

const outDir = resolve(process.argv[2] ?? "docs/demo-kit");

const BANK = {
  name: "STATE BANK OF INDIA",
  branch: "Demo Branch, Pune",
  ifsc: "SBIN0DEMO01",
  address: "Ground Floor, Sample Plaza, Demo Chowk, Pune 411000",
};

const inr = (rupees) => "Rs. " + rupees.toLocaleString("en-IN") + "/-";
const amt = (rupees) => (rupees ? rupees.toLocaleString("en-IN") + ".00" : "");

/** Running balance from (date, particulars, debit, credit) rows. */
function ledger(rows) {
  let bal = 0;
  return rows.map(([date, text, dr, cr]) => {
    bal += (dr ?? 0) - (cr ?? 0);
    return [date, text, amt(dr), amt(cr), amt(bal) + " Dr"];
  });
}

const CASES = [
  {
    id: "DEMO-CASE-A",
    borrower: "Rohit Demo Joshi",
    occupation: "proprietor of M/s Joshi Demo Traders",
    address: "Flat 7, Sample Heights, Test Lane, Kothrud, Pune 411038",
    guarantor: "Swati Test Joshi",
    guarantorAddress: "Flat 7, Sample Heights, Test Lane, Kothrud, Pune 411038",
    account: "DEMO40217731",
    facility: "Term Loan",
    purpose: "purchase of shop fixtures and stock for the trading business",
    sanctionRef: "SBIN0DEMO01/ADV/2023/117",
    sanctionDate: "12/03/2023",
    disbursedOn: "15/03/2023",
    amount: 650000,
    rate: "10.75",
    tenure: 60,
    emi: 14050,
    npaDate: "30/06/2025",
    asOn: "30/09/2026",
    security: "Hypothecation of stock and shop fixtures; personal guarantee of Swati Test Joshi",
    rows: [
      ["15/03/2023", "Loan disbursed", 650000],
      ["31/03/2024", "Interest applied 2023-24", 66875],
      ["31/03/2024", "EMIs received 2023-24", null, 160500],
      ["31/03/2025", "Interest applied 2024-25", 59810],
      ["31/03/2025", "EMIs received 2024-25", null, 72000],
      ["30/06/2025", "Interest applied Apr-Jun 2025", 14627],
      ["30/06/2025", "Account classified NPA (interest not applied thereafter)"],
    ],
    acknowledgement: "10/01/2025",
  },
  {
    id: "DEMO-CASE-B",
    borrower: "Ganesh Fake Wagh",
    occupation: "transport operator",
    address: "House 21, Synthetic Colony, Hadapsar, Pune 411028",
    guarantor: null,
    account: "DEMO40388902",
    facility: "Vehicle Loan",
    purpose: "purchase of one goods carrier (Demo Motors DM-1109), registration MH-12-ZZ-0000",
    sanctionRef: "SBIN0DEMO01/ADV/2022/064",
    sanctionDate: "05/08/2022",
    disbursedOn: "10/08/2022",
    amount: 1240000,
    rate: "9.85",
    tenure: 72,
    emi: 18200,
    npaDate: "31/03/2025",
    asOn: "30/09/2026",
    security: "Hypothecation of the vehicle, bank's lien noted in the RC",
    rows: [
      ["10/08/2022", "Loan disbursed", 1240000],
      ["31/03/2023", "Interest applied 2022-23", 77320],
      ["31/03/2023", "EMIs received 2022-23", null, 182000],
      ["31/03/2024", "Interest applied 2023-24", 108950],
      ["31/03/2024", "EMIs received 2023-24", null, 218400],
      ["31/12/2024", "Interest applied Apr-Dec 2024", 74215],
      ["31/12/2024", "EMIs received Apr-Sep 2024", null, 54600],
      ["31/03/2025", "Account classified NPA (interest not applied thereafter)"],
    ],
  },
];

const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Liberation Serif", "Times New Roman", serif; font-size: 15px; color: #111; }
  .page { width: 210mm; height: 297mm; padding: 18mm 20mm; position: relative; page-break-after: always; overflow: hidden; }
  .lh { text-align: center; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 14px; }
  .lh .b { font-size: 22px; font-weight: bold; letter-spacing: 1px; }
  .lh .s { font-size: 13px; }
  h1 { font-size: 18px; text-align: center; text-decoration: underline; margin: 14px 0; }
  p { line-height: 1.55; text-align: justify; margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 14px; }
  td, th { border: 1px solid #222; padding: 5px 7px; vertical-align: top; }
  th { background: #eee; }
  .num { text-align: right; white-space: nowrap; }
  .kv td:first-child { width: 38%; font-weight: bold; }
  .sig { margin-top: 34px; display: flex; justify-content: space-between; gap: 20px; }
  .sig div { min-width: 40%; }
  .stamp { position: absolute; right: 24mm; bottom: 34mm; width: 34mm; height: 34mm; border: 2px solid #335; border-radius: 50%;
           color: #335; font-size: 10px; text-align: center; padding-top: 10mm; transform: rotate(-12deg); opacity: .7; }
  .wm { position: absolute; left: 0; right: 0; bottom: 8mm; text-align: center; font: 11px sans-serif; color: #777; }
  .right { text-align: right; }
`;

const letterhead = `<div class="lh"><div class="b">${BANK.name}</div>
  <div class="s">${BANK.branch} · IFSC ${BANK.ifsc}</div><div class="s">${BANK.address}</div></div>`;
const wm = `<div class="wm">SYNTHETIC — DEMO ONLY · not a real bank document</div>`;
const stamp = `<div class="stamp">STATE BANK<br>OF INDIA<br>DEMO BRANCH</div>`;
const pg = (inner, withStamp = true) => `<section class="page">${letterhead}${inner}${withStamp ? stamp : ""}${wm}</section>`;

function pages(c) {
  const ledgerRows = ledger(c.rows);
  const outstanding = c.rows.reduce((s, [, , dr, cr]) => s + (dr ?? 0) - (cr ?? 0), 0);
  const out = [];

  out.push(
    pg(`<p class="right">Ref: ${c.sanctionRef}<br>Date: ${c.sanctionDate}</p>
    <p>To,<br>${c.borrower}<br>${c.address}</p>
    <h1>SANCTION LETTER — ${c.facility.toUpperCase()}</h1>
    <p>Dear Sir,</p>
    <p>With reference to your application, we are pleased to inform you that the Bank has sanctioned a ${c.facility}
    of <b>${inr(c.amount)}</b> to you for ${c.purpose}, on the following terms and conditions:</p>
    <table class="kv">
      <tr><td>Borrower</td><td>${c.borrower}</td></tr>
      <tr><td>Loan account no.</td><td>${c.account}</td></tr>
      <tr><td>Facility</td><td>${c.facility}</td></tr>
      <tr><td>Sanctioned amount</td><td>${inr(c.amount)}</td></tr>
      <tr><td>Rate of interest</td><td>${c.rate}% per annum, with monthly rests</td></tr>
      <tr><td>Repayment</td><td>${c.tenure} monthly instalments of ${inr(c.emi)}</td></tr>
      <tr><td>Security</td><td>${c.security}</td></tr>
      ${c.guarantor ? `<tr><td>Guarantor</td><td>${c.guarantor}</td></tr>` : ""}
      <tr><td>Penal interest</td><td>2% p.a. over the applicable rate on overdue amounts</td></tr>
    </table>
    <p>Please convey your acceptance by signing the duplicate of this letter and executing the loan documents.</p>
    <div class="sig"><div>Accepted<br><br><br>(${c.borrower})<br>Borrower</div><div class="right">Yours faithfully,<br><br><br>Branch Manager<br>${BANK.branch}</div></div>`),
  );

  out.push(
    pg(`<h1>LOAN AGREEMENT (EXTRACT)</h1>
    <p>This Agreement is made at Pune on ${c.sanctionDate} between <b>State Bank of India</b>, a body corporate constituted under
    the State Bank of India Act, 1955, acting through its ${BANK.branch} (hereinafter "the Bank") of the one part, and
    <b>${c.borrower}</b>, ${c.occupation}, residing at ${c.address} (hereinafter "the Borrower") of the other part${
      c.guarantor ? `, with <b>${c.guarantor}</b>, residing at ${c.guarantorAddress}, as Guarantor` : ""
    }.</p>
    <p>1. The Bank has agreed to lend and the Borrower has agreed to borrow a ${c.facility} of ${inr(c.amount)} in loan account
    no. ${c.account}, for ${c.purpose}.</p>
    <p>2. The Borrower shall pay interest at ${c.rate}% per annum with monthly rests and shall repay the loan in ${c.tenure} equated
    monthly instalments of ${inr(c.emi)} each, commencing from the month following disbursement.</p>
    <p>3. On default in payment of any instalment or interest, the Bank may recall the entire outstanding, which shall become
    payable forthwith with interest and penal interest at 2% per annum over the applicable rate.</p>
    <p>4. The security for the loan shall be: ${c.security}.</p>
    <p>5. Any certificate of the Bank as to the amount due, based on entries in its books of account, shall be accepted by the
    Borrower as evidence of the debt.</p>
    <div class="sig"><div>Borrower<br><br><br>(${c.borrower})${c.guarantor ? `<br><br>Guarantor<br><br><br>(${c.guarantor})` : ""}</div>
    <div class="right">For State Bank of India<br><br><br>Branch Manager</div></div>`),
  );

  if (c.guarantor) {
    out.push(
      pg(`<h1>DEED OF GUARANTEE</h1>
      <p>In consideration of State Bank of India, ${BANK.branch} ("the Bank") granting a ${c.facility} of ${inr(c.amount)} to
      ${c.borrower} ("the Borrower") in loan account no. ${c.account}, I, <b>${c.guarantor}</b>, residing at ${c.guarantorAddress},
      hereby guarantee to the Bank the due repayment on demand of all sums due under the said account, together with interest,
      costs and charges.</p>
      <p>This guarantee is a continuing guarantee and my liability is co-extensive with that of the Borrower. The Bank may
      proceed against me without first proceeding against the Borrower or the security.</p>
      <p>Executed at Pune on ${c.sanctionDate}.</p>
      <div class="sig"><div>Guarantor<br><br><br>(${c.guarantor})</div><div class="right">Witness<br><br><br>(Demo Witness)</div></div>`),
    );
  } else {
    out.push(
      pg(`<h1>DEED OF HYPOTHECATION (VEHICLE)</h1>
      <p>I, <b>${c.borrower}</b>, residing at ${c.address}, in consideration of State Bank of India, ${BANK.branch} granting me a
      ${c.facility} of ${inr(c.amount)} in loan account no. ${c.account}, hereby hypothecate to the Bank, by way of first charge,
      the vehicle described below, as security for the repayment of the loan with interest, costs and charges.</p>
      <table class="kv">
        <tr><td>Vehicle</td><td>Goods carrier, Demo Motors DM-1109</td></tr>
        <tr><td>Registration no.</td><td>MH-12-ZZ-0000</td></tr>
        <tr><td>Chassis no.</td><td>DEMOCHS0000001</td></tr>
        <tr><td>Engine no.</td><td>DEMOENG0000001</td></tr>
      </table>
      <p>I shall keep the vehicle insured with the Bank as loss payee and shall not sell or transfer it without the Bank's written
      consent. Executed at Pune on ${c.sanctionDate}.</p>
      <div class="sig"><div>Borrower<br><br><br>(${c.borrower})</div><div class="right">For State Bank of India<br><br><br>Branch Manager</div></div>`),
    );
  }

  out.push(
    pg(`<h1>STATEMENT OF ACCOUNT</h1>
    <table class="kv">
      <tr><td>Name</td><td>${c.borrower}</td></tr>
      <tr><td>Loan account no.</td><td>${c.account}</td></tr>
      <tr><td>Facility</td><td>${c.facility} · ROI ${c.rate}% p.a.</td></tr>
      <tr><td>Period</td><td>${c.disbursedOn} to ${c.asOn}</td></tr>
    </table>
    <table>
      <tr><th>Date</th><th>Particulars</th><th>Debit (Rs.)</th><th>Credit (Rs.)</th><th>Balance (Rs.)</th></tr>
      ${ledgerRows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td><td class="num">${r[4]}</td></tr>`).join("")}
    </table>
    <p><b>Total outstanding as on ${c.asOn}: ${inr(outstanding)}</b> (exclusive of interest from the date of NPA, costs and charges).</p>
    <p>Certified that the above is a true extract of the entries in the books of account maintained by the Bank in the ordinary
    course of business.</p>
    <div class="sig"><div></div><div class="right">Branch Manager<br>${BANK.branch}</div></div>`),
  );

  out.push(
    pg(`<p class="right">Ref: ${BANK.ifsc}/REC/${c.account.slice(-4)}<br>Date: ${c.npaDate}</p>
    <p>To,<br>${c.borrower}<br>${c.address}</p>
    ${c.guarantor ? `<p>Copy to: ${c.guarantor} (Guarantor)</p>` : ""}
    <h1>CLASSIFICATION OF ACCOUNT AS NON-PERFORMING ASSET</h1>
    <p>Dear Sir,</p>
    <p>Re: ${c.facility} account no. ${c.account} — sanctioned on ${c.sanctionDate} for ${inr(c.amount)}</p>
    <p>You have failed to pay the instalments and interest due in the above account despite reminders. The account has therefore
    been classified as a <b>Non-Performing Asset on ${c.npaDate}</b> in accordance with the prudential norms of the Reserve Bank of India.</p>
    <p>The amount outstanding in the account is ${inr(outstanding)} as per the books of the Bank. You are requested to regularise
    the account immediately, failing which the Bank will initiate recovery proceedings without further notice.</p>
    <div class="sig"><div></div><div class="right">Branch Manager<br>${BANK.branch}</div></div>`),
  );

  if (c.acknowledgement) {
    out.push(
      pg(
        `<p class="right">Date: ${c.acknowledgement}</p>
      <p>To,<br>The Branch Manager<br>State Bank of India, ${BANK.branch}</p>
      <h1>BALANCE CONFIRMATION AND ACKNOWLEDGEMENT OF DEBT</h1>
      <p>I, ${c.borrower}, confirm that a sum of ${inr(573812)} is due and payable by me to the Bank in ${c.facility} account
      no. ${c.account} as on 31/12/2024, together with further interest, and I acknowledge my liability to pay the same.</p>
      <div class="sig"><div></div><div class="right">Yours faithfully,<br><br><br>(${c.borrower})</div></div>`,
        false,
      ),
    );
  }

  return { html: `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${out.join("")}</body></html>`, outstanding, count: out.length };
}

/** Rasterise at 300 DPI and degrade each page like a desk scanner, then rebuild an image-only PDF. */
function scanLike(pdf, dir, file, seed) {
  execFileSync("pdftoppm", ["-r", "300", "-gray", "-png", pdf, join(dir, "p")]);
  const imgs = readdirSync(dir)
    .filter((f) => f.startsWith("p") && f.endsWith(".png"))
    .sort()
    .map((f, k) => {
      const out = join(dir, `s-${k}.jpg`);
      const angle = (((seed * 7 + k * 3) % 11) - 5) / 6; // about ±0.8°
      execFileSync("convert", [
        join(dir, f), "-background", "white", "-rotate", angle.toFixed(2),
        "-attenuate", "0.3", "+noise", "Gaussian", "-blur", "0x0.5",
        "-gravity", "center", "-extent", "2480x3508", "-density", "300", "-units", "PixelsPerInch",
        "-quality", "62", out,
      ]);
      return out;
    });
  execFileSync("convert", [...imgs, "-density", "300", "-units", "PixelsPerInch", "-compress", "jpeg", "-quality", "62", file]);
  return imgs.length;
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const manifest = [];
for (const [i, c] of CASES.entries()) {
  const dir = mkdtempSync(join(tmpdir(), "demo-kit-"));
  try {
    const { html, outstanding } = pages(c);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = join(dir, "clean.pdf");
    await page.pdf({ path: pdf, format: "A4", printBackground: true });
    await page.close();
    const file = join(outDir, `${c.id}-bank-scans.pdf`);
    const n = scanLike(pdf, dir, file, i + 3);
    manifest.push({
      file: `${c.id}-bank-scans.pdf`,
      pages: n,
      expected: {
        borrower_name: c.borrower,
        borrower_address: c.address,
        guarantor_name: c.guarantor,
        bank_name: "State Bank of India",
        branch_name: BANK.branch,
        ifsc: BANK.ifsc,
        loan_account_number: c.account,
        facility_type: c.facility,
        sanction_date: c.sanctionDate,
        sanction_amount: inr(c.amount),
        interest_rate: `${c.rate}%`,
        npa_date: c.npaDate,
        outstanding_amount: inr(outstanding),
        outstanding_as_on: c.asOn,
      },
    });
    console.log(`${file}  ${n} pages  outstanding ${inr(outstanding)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
await browser.close();
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

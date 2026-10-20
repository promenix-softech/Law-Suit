// Bulk intake end to end with the real tools (Ghostscript, OCRmyPDF, qpdf, poppler).
// The batch is an image-only PDF of two synthetic loan files. Skipped where tools are missing.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyBatch, splitBatch, type Batch, type IntakeDb, type ProposedPage } from "./intake";
import type { Store } from "./jobs";

const ORG = "11111111-1111-1111-1111-111111111111";
const BATCH = "ba000000-0000-0000-0000-000000000001";
const CASE_B = "c0000000-0000-0000-0000-000000000002";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const works = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const toolsPresent =
  works("gs", ["--version"]) && works("qpdf", ["--version"]) && works("pdftotext", ["-v"]) && works(process.env.OCRMYPDF_BIN ?? "ocrmypdf", ["--version"]);

const PAGES: string[][] = [
  ["SANCTION LETTER", "SYNTHETIC - DEMO ONLY", "We are pleased to inform you that a Term Loan", "has been sanctioned to you.", "Loan account no.: DEMO0040033", "Sanctioned amount: Rs 3,00,000"],
  ["STATEMENT OF ACCOUNT", "Account: DEMO0040033", "Name: Ramesh Demo Patil", "Date Particulars Debit Credit Balance"],
  ["SANCTION LETTER", "We are pleased to inform you that a Cash Credit", "has been sanctioned to you.", "Loan account no.: DEMO0040021"],
  ["LOAN AGREEMENT (EXTRACT)", "This agreement is made at Pune between the Bank", "and Sunita Test Kulkarni (\"the Borrower\")."],
  ["NPA CLASSIFICATION NOTICE", "Dear Sunita Test Kulkarni, your loan account no. DEMO0040021", "has been classified as a Non-Performing Asset", "as per RBI norms."],
  ["Signature page", "SYNTHETIC - DEMO ONLY"],
];

/** PostScript pages → image-only PDF at 200 DPI (no text layer, so OCR really runs). */
function scannedBatch(dir: string): Buffer {
  const ps = PAGES.map(
    (lines) =>
      "/Helvetica findfont 16 scalefont setfont\n" +
      lines.map((l, i) => `72 ${760 - i * 28} moveto (${l.replace(/[()\\]/g, "\\$&")}) show`).join("\n") +
      "\nshowpage",
  ).join("\n");
  writeFileSync(join(dir, "b.ps"), ps);
  execFileSync("gs", ["-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfimage8", "-r200", "-sPAPERSIZE=a4", `-sOutputFile=${join(dir, "b.pdf")}`, join(dir, "b.ps")]);
  return readFileSync(join(dir, "b.pdf"));
}

function memoryStore(files: Record<string, Buffer>): Store {
  return {
    async download(p) {
      const f = files[p];
      if (!f) throw new Error(`missing ${p}`);
      return f;
    },
    async upload(p, body) {
      if (files[p]) throw new Error("exists");
      files[p] = body;
    },
  };
}

describe.skipIf(!toolsPresent)("bulk intake (real OCR)", () => {
  it("splits a two-file scan into proposed cases, then applies the confirmed split", async () => {
    const dir = execFileSync("mktemp", ["-d"]).toString().trim();
    const scan = scannedBatch(dir);
    execFileSync("rm", ["-rf", dir]);
    const files: Record<string, Buffer> = { [`${ORG}/${BATCH}/scan.pdf`]: scan };
    const store = memoryStore(files);

    let saved: ProposedPage[] = [];
    const createdCases: Record<string, string> = {};
    const docs: { caseId: string; path: string; pages: number }[] = [];
    const numbers: Record<string, string> = { "CS-TAKEN": "c0000000-0000-0000-0000-000000000077" };
    const db: IntakeDb = {
      savePages: async (_b, pages) => void (saved = pages),
      caseByNumber: async (_org, no) => numbers[no] ?? null,
      createCase: async (_b, group, no) => {
        const id = `c0000000-0000-0000-0000-00000000000${Object.keys(createdCases).length + 1}`;
        createdCases[String(group)] = id;
        numbers[no] = id;
        return id;
      },
      caseInOrg: async (org, id) => org === ORG && id === CASE_B,
      addDocument: async (_b, caseId, path, _sha, pages) => void docs.push({ caseId, path, pages }),
      markApplied: async () => undefined,
    };
    const batch: Batch = {
      id: BATCH,
      org_id: ORG,
      storage_path: `${ORG}/${BATCH}/scan.pdf`,
      sha256: sha(scan),
      status: "splitting",
      page_count: null,
      plan: null,
      created_cases: {},
      created_by: ORG,
    };

    expect(await splitBatch(batch, store, db)).toBe(6);
    expect(saved.map((p) => p.group)).toEqual([1, 1, 2, 2, 2, 2]);
    expect(saved.map((p) => p.class)).toEqual(["sanction_letter", "account_statement", "sanction_letter", "loan_agreement", "npa_notice", "other"]);
    expect(saved[0]!.accountLast4).toBe("0033");
    expect(JSON.stringify(saved)).not.toContain("DEMO0040033"); // the number itself is never stored

    // A case number someone else took after the split was confirmed is refused before any write.
    const taken: Batch = { ...batch, status: "applying", page_count: 6, plan: [{ pages: [1, 2], case_no: "CS-TAKEN" }, { pages: [3, 4, 5, 6], case_id: CASE_B }] };
    await expect(applyBatch(taken, store, db)).rejects.toThrow(/taken/);
    expect(docs).toEqual([]);

    // Admin confirms: group 1 is a new case, group 2 joins an existing case.
    const applied: Batch = { ...batch, status: "applying", page_count: 6, plan: [{ pages: [1, 2], case_no: "DEMO-NEW-1" }, { pages: [3, 4, 5, 6], case_id: CASE_B }] };
    expect(await applyBatch(applied, store, db)).toBe(2);
    expect(createdCases).toEqual({ "0": "c0000000-0000-0000-0000-000000000001" });
    expect(docs).toEqual([
      { caseId: "c0000000-0000-0000-0000-000000000001", path: `${ORG}/c0000000-0000-0000-0000-000000000001/scans/batch-ba000000-1.pdf`, pages: 2 },
      { caseId: CASE_B, path: `${ORG}/${CASE_B}/scans/batch-ba000000-2.pdf`, pages: 4 },
    ]);

    // A retry reuses the case this batch created and the files already stored.
    expect(await applyBatch({ ...applied, created_cases: createdCases }, store, db)).toBe(2);
    expect(Object.keys(createdCases)).toHaveLength(1);
  }, 300_000);

  it("refuses a plan pointing at another office's case", async () => {
    const body = Buffer.from("%PDF-1.4\n");
    const db = { caseInOrg: async () => false } as unknown as IntakeDb;
    const b: Batch = {
      id: BATCH,
      org_id: ORG,
      storage_path: `${ORG}/${BATCH}/scan.pdf`,
      sha256: sha(body),
      status: "applying",
      page_count: 1,
      plan: [{ pages: [1], case_id: "c0000000-0000-0000-0000-000000000099" }],
      created_cases: {},
      created_by: ORG,
    };
    await expect(applyBatch(b, memoryStore({ [`${ORG}/${BATCH}/scan.pdf`]: body }), db)).rejects.toThrow();
  });

  it("refuses a stored scan that does not match the upload checksum", async () => {
    const b = { id: BATCH, org_id: ORG, storage_path: `${ORG}/${BATCH}/scan.pdf`, sha256: "0".repeat(64), status: "splitting", page_count: null, plan: null, created_cases: {}, created_by: ORG } as Batch;
    await expect(splitBatch(b, memoryStore({ [`${ORG}/${BATCH}/scan.pdf`]: Buffer.from("%PDF-1.4\n") }), {} as IntakeDb)).rejects.toThrow(/checksum/);
  });
});

// End-to-end job runs with the real converters (LibreOffice, Ghostscript, qpdf, OCRmyPDF,
// poppler). Skipped where they are not installed. Synthetic data only.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAffidavit, buildVakalatnama, type CaptionInput } from "@civil-suits/templates";
import { renderDocx } from "@civil-suits/templates/docx";
import { caseStore, JobError, MAX_INPUT_BYTES, runJob, type CaseForBundle, type Db, type Job, type Store } from "./jobs";
import { inspect, withTempDir } from "./tools";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const have = (cmd: string) => {
  try {
    execFileSync("sh", ["-c", `command -v ${cmd}`]);
    return true;
  } catch {
    return false;
  }
};
/** Present and actually runnable (a broken Python install can leave a dead ocrmypdf on PATH). */
const ocrmypdfWorks = () => {
  try {
    execFileSync(process.env.OCRMYPDF_BIN ?? "ocrmypdf", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const toolsPresent = ["soffice", "gs", "qpdf", "pdfinfo"].every(have) && ocrmypdfWorks();

const ORG = "11111111-1111-1111-1111-111111111111";
const CASE = "c0000000-0000-0000-0000-000000000001";

const caption: Omit<CaptionInput, "court"> = {
  year: 2026,
  suitType: "commercial",
  bank: { name: "State Bank of India", branch: "Demo Branch, Pune" },
  defendants: [{ name: "Vijay Sample Jadhav", role: "borrower", address: null }],
};

function memoryStore(files: Record<string, Buffer>): Store & { files: Record<string, Buffer> } {
  return {
    files,
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

/** A one-page "scan": PostScript text rasterised to PNG, like a phone photo of a page. */
function syntheticScanPng(): Buffer {
  return withTempDirSync((dir) => {
    const ps = join(dir, "page.ps");
    writeFileSync(ps, "/Times-Roman findfont 24 scalefont setfont 72 700 moveto (SYNTHETIC LOAN AGREEMENT - DEMO ONLY) show showpage\n");
    const png = join(dir, "page.png");
    execFileSync("gs", ["-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pnggray", "-r150", "-sPAPERSIZE=a4", "-dFIXEDMEDIA", `-sOutputFile=${png}`, ps]);
    return readFileSync(png);
  });
}

function withTempDirSync<T>(fn: (dir: string) => T): T {
  const dir = execFileSync("mktemp", ["-d"]).toString().trim();
  try {
    return fn(dir);
  } finally {
    execFileSync("rm", ["-rf", dir]);
  }
}

describe("caseStore", () => {
  const job: Job = { id: "j", org_id: ORG, case_id: CASE, kind: "draft_pdf", payload: {} };
  const inner = memoryStore({
    [`22222222-2222-2222-2222-222222222222/${CASE}/scans/x.pdf`]: Buffer.from("secret"),
    [`${ORG}/c0000000-0000-0000-0000-000000000009/scans/x.pdf`]: Buffer.from("secret"),
    [`${ORG}/${CASE}/scans/big.pdf`]: Buffer.alloc(MAX_INPUT_BYTES + 1),
  });
  const s = caseStore(inner, job);

  it("refuses files of another org or case, and traversal", async () => {
    await expect(s.download(`22222222-2222-2222-2222-222222222222/${CASE}/scans/x.pdf`)).rejects.toBeInstanceOf(JobError);
    await expect(s.download(`${ORG}/c0000000-0000-0000-0000-000000000009/scans/x.pdf`)).rejects.toBeInstanceOf(JobError);
    await expect(s.download(`${ORG}/${CASE}/../c0000000-0000-0000-0000-000000000009/scans/x.pdf`)).rejects.toThrow(/outside/);
    await expect(s.upload(`22222222-2222-2222-2222-222222222222/${CASE}/drafts/x.pdf`, Buffer.from(""), "application/pdf")).rejects.toThrow(
      /outside/,
    );
  });

  it("refuses oversized inputs", async () => {
    await expect(s.download(`${ORG}/${CASE}/scans/big.pdf`)).rejects.toThrow(/40 MB/);
  });

  it("refuses a draft version whose DOCX sits in another case", async () => {
    const db = { draftVersion: async () => ({ docxPath: `22222222-2222-2222-2222-222222222222/${CASE}/drafts/x.docx` }) } as unknown as Db;
    await expect(runJob({ ...job, payload: { draft_version_id: "v" } }, inner, db)).rejects.toThrow(/outside/);
  });
});

describe.skipIf(!toolsPresent)("worker jobs (real converters)", () => {
  it("converts a draft DOCX to PDF/A-2b next to it", async () => {
    const docx = `${ORG}/${CASE}/drafts/vakalatnama-en-v1.docx`;
    const store = memoryStore({ [docx]: await renderDocx(buildVakalatnama({ ...caption, court: { name: "Civil Judge Senior Division", place: "Pune" } })) });
    const db = { draftVersion: async () => ({ docxPath: docx }) } as unknown as Db;
    const job: Job = { id: "j1", org_id: ORG, case_id: CASE, kind: "draft_pdf", payload: { draft_version_id: "v1" } };

    const res = await runJob(job, store, db);
    expect(res.path).toBe(`${ORG}/${CASE}/drafts/vakalatnama-en-v1.pdf`);
    expect(store.files[res.path]!.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.meta.pages).toBeGreaterThan(0);
  }, 120_000);

  it("builds a bookmarked, A4, PDF/A-2b e-filing bundle", async () => {
    const court = { name: "Civil Judge Senior Division, Pune (Demo)", district: "Pune" };
    const docCaption = { ...caption, court: { name: "Civil Judge Senior Division", place: "Pune" } };
    const files: Record<string, Buffer> = {
      [`${ORG}/${CASE}/drafts/plaint.docx`]: await renderDocx(buildVakalatnama(docCaption)),
      [`${ORG}/${CASE}/drafts/sot.docx`]: await renderDocx(buildAffidavit(docCaption)),
      [`${ORG}/${CASE}/scans/scan.png`]: syntheticScanPng(),
    };
    const store = memoryStore(files);
    const usage: number[] = [];
    const db: Db = {
      draftVersion: async () => null,
      caseForBundle: async (): Promise<CaseForBundle> => ({
        caseNo: "CS/2026/0001",
        caption: { ...caption, court },
        drafts: [
          { kind: "statement_of_truth", docxPath: `${ORG}/${CASE}/drafts/sot.docx`, pdfPath: null },
          { kind: "plaint", docxPath: `${ORG}/${CASE}/drafts/plaint.docx`, pdfPath: null },
        ],
        documents: { doc1: { storagePath: `${ORG}/${CASE}/scans/scan.png` } },
      }),
      logUsage: async (_j, _k, qty) => void usage.push(qty),
    };
    const job: Job = {
      id: "j2",
      org_id: ORG,
      case_id: CASE,
      kind: "efiling_bundle",
      payload: { annexures: [{ document_id: "doc1", title: "Loan agreement" }] },
    };

    const res = await runJob(job, store, db);
    expect(res.path).toBe(`${ORG}/${CASE}/filing/j2/CS_2026_0001_BUNDLE_01.pdf`);
    const entries = res.meta.entries as { title: string; from: number; to: number; mark?: string }[];
    expect(entries.map((e) => e.title)).toEqual(["Index", "Plaint", "Loan agreement", "Statement of truth"]);
    expect(entries[2]!.mark).toBe("A");
    expect(usage).toEqual([1]);
    if (process.env.BUNDLE_SAMPLE_OUT) writeFileSync(process.env.BUNDLE_SAMPLE_OUT, store.files[res.path]!);

    await withTempDir(async (dir) => {
      const out = join(dir, "b.pdf");
      writeFileSync(out, store.files[res.path]!);
      const check = await inspect(out);
      expect(check.pdfaPart).toBe("2");
      expect(check.encrypted).toBe(false);
      expect(check.pageCount).toBe(entries.at(-1)!.to);
      // Bookmarks: one per entry.
      const outline = execFileSync("qpdf", ["--json", "--json-key=outlines", out]).toString();
      expect(JSON.parse(outline).outlines).toHaveLength(entries.length);
      // The index is real text with the page ranges.
      const text = execFileSync("pdftotext", ["-f", "1", "-l", "1", out, "-"]).toString();
      expect(text).toContain("INDEX");
      expect(text).toContain("Loan agreement");
    });
  }, 300_000);
});

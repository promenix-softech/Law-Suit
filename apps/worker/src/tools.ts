import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pdfaDefinition, pdfmarks, type BundleCheck, type PlannedPart } from "./bundle";

const exec = promisify(execFile);

/** sRGB profile shipped with Ghostscript (Debian/Ubuntu path; override in the image if needed). */
const ICC = process.env.SRGB_ICC_PATH ?? "/usr/share/color/icc/ghostscript/srgb.icc";

/**
 * Converters parse user-supplied files, so they get a minimal environment: never the
 * service-role key or any other secret held by the worker process.
 */
function childEnv(): NodeJS.ProcessEnv {
  const tmp = process.env.JOB_TMP ?? tmpdir();
  return { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: tmp, TMPDIR: tmp, LANG: "C.UTF-8" };
}

/** Thrown for tool failures; carries a short code for the job record, details stay in debug logs. */
export class ToolError extends Error {
  constructor(
    readonly tool: string,
    readonly detail: string,
  ) {
    super(`${tool} could not process the file`);
  }
}

async function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<string> {
  try {
    const { stdout } = await exec(cmd, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: childEnv() });
    return stdout;
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new ToolError(cmd.split("/").pop()!, (err.stderr || err.message).slice(0, 400));
  }
}

/** Runs fn in a private temp directory that is always removed (scans and drafts hold PII). */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "cs-job-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** DOCX → PDF/A-2b via LibreOffice. Each call gets its own profile dir so jobs can run in parallel. */
export async function docxToPdfA(docx: Buffer, dir: string, name = "doc"): Promise<string> {
  const src = join(dir, `${name}.docx`);
  await writeFile(src, docx);
  const filter = 'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"2"}}';
  await run("soffice", [
    `-env:UserInstallation=file://${join(dir, "lo-profile")}`,
    "--headless",
    "--convert-to",
    filter,
    "--outdir",
    dir,
    src,
  ]);
  return join(dir, `${name}.pdf`);
}

/** Adds a text layer to a scan and makes it PDF/A-2 (Phase 1: English + Marathi when installed). */
export async function ocrScan(
  input: string,
  output: string,
  langs = process.env.OCR_LANGS ?? "eng",
  isImage = false,
): Promise<string> {
  const args = ["--output-type", "pdfa-2", "--skip-text", "--rotate-pages", "-l", langs];
  if (isImage) args.push("--image-dpi", "300");
  await run(process.env.OCRMYPDF_BIN ?? "ocrmypdf", [...args, input, output], 600_000);
  return output;
}

/** Text layer of one page (after OCR), layout-free. */
export async function pageText(pdf: string, page: number): Promise<string> {
  return run("pdftotext", ["-f", String(page), "-l", String(page), "-enc", "UTF-8", pdf, "-"]);
}

/** Copies the given 1-based pages, in that order, into a new PDF. */
export async function extractPages(src: string, pages: number[], out: string): Promise<string> {
  if (!pages.length || pages.some((p) => !Number.isInteger(p) || p < 1)) throw new Error("Invalid page list");
  // Deterministic id: the same pages give the same bytes, so a retried apply can recognise its file.
  await run("qpdf", ["--deterministic-id", "--empty", "--pages", src, pages.join(","), "--", out]);
  return out;
}

export async function pageCount(pdf: string): Promise<number> {
  return Number((await run("qpdf", ["--show-npages", pdf])).trim());
}

export async function isEncrypted(pdf: string): Promise<boolean> {
  // qpdf --is-encrypted: exit 0 = encrypted, 2 = not encrypted.
  try {
    await exec("qpdf", ["--is-encrypted", pdf], { timeout: 60_000, env: childEnv() });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 2) return false;
    throw e;
  }
}

/** Merges parts in order with bookmarks and writes PDF/A-2b. */
export async function mergePdfA(inputs: string[], parts: PlannedPart[], title: string, dir: string, out: string) {
  const def = join(dir, "pdfa_def.ps");
  const marks = join(dir, "marks.ps");
  await writeFile(def, pdfaDefinition(ICC));
  await writeFile(marks, pdfmarks(title, parts));
  await run(
    "gs",
    [
      "-dPDFA=2",
      "-dBATCH",
      "-dNOPAUSE",
      `--permit-file-read=${ICC}`,
      "-dQUIET",
      "-sDEVICE=pdfwrite",
      "-sColorConversionStrategy=RGB",
      "-dPDFACompatibilityPolicy=1",
      // Scans come in any size; scale every page onto A4 as the registry requires.
      "-sPAPERSIZE=a4",
      "-dFIXEDMEDIA",
      "-dPDFFitPage",
      `-sOutputFile=${out}`,
      def,
      ...inputs,
      marks,
    ],
    600_000,
  );
  return out;
}

export async function inspect(pdf: string): Promise<BundleCheck> {
  const bytes = (await readFile(pdf)).length;
  const info = await run("pdfinfo", ["-f", "1", "-l", "100000", pdf]);
  const pageSizes = [...info.matchAll(/^Page\s+\d+\s+size:\s+([\d.]+) x ([\d.]+)/gm)].map((m) => ({ w: Number(m[1]), h: Number(m[2]) }));
  const meta = await run("pdfinfo", ["-meta", pdf]);
  // XMP writes it as an element (<pdfaid:part>2<) or an attribute (pdfaid:part='2' / "2").
  const part = /pdfaid:part(?:>|=["'])(\d)/.exec(meta)?.[1] ?? null;
  return { bytes, encrypted: await isEncrypted(pdf), pageCount: await pageCount(pdf), pageSizes, pdfaPart: part };
}

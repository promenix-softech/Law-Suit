import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { buildBundleIndex, courtTitle, type CaptionInput } from "@civil-suits/templates";
import { renderDocx } from "@civil-suits/templates/docx";
import {
  bundleFileName,
  bundleProblems,
  DRAFT_ORDER,
  DRAFT_TITLE,
  exhibitMark,
  orderParts,
  planPages,
  type BundleDraftKind,
  type BundlePart,
  pathInCase,
} from "./bundle";
import { docxToPdfA, inspect, mergePdfA, ocrScan, pageCount, withTempDir } from "./tools";

export interface Job {
  id: string;
  org_id: string;
  case_id: string;
  kind: "draft_pdf" | "efiling_bundle" | "case_export";
  payload: Record<string, unknown>;
}

export interface CaseExport {
  caseNo: string;
  /** Rows of the case's tables, without *_enc ciphertext columns. */
  tables: Record<string, unknown>;
  /** Storage paths of every file belonging to the case. */
  files: string[];
}

export interface CaseForBundle {
  caseNo: string;
  caption: Omit<CaptionInput, "court"> & { court: { name: string; district: string } | null };
  /** Latest approved version of each draft kind. */
  drafts: { kind: string; docxPath: string; pdfPath: string | null }[];
  /** Case documents by id. */
  documents: Record<string, { storagePath: string }>;
}

/**
 * case-files: scans, drafts, bundles. case-exports: admin-only ZIPs, deleted after 7 days.
 * case-batches: bulk-intake uploads, {org_id}/{batch_id}/{file}.
 */
export type Bucket = "case-files" | "case-exports" | "case-batches";

export interface Store {
  download(path: string, bucket?: Bucket): Promise<Buffer>;
  upload(path: string, body: Buffer, contentType: string, bucket?: Bucket): Promise<void>;
}

export interface Db {
  draftVersion(id: string): Promise<{ docxPath: string } | null>;
  caseForBundle(caseId: string): Promise<CaseForBundle>;
  logUsage(job: Job, kind: "suit_pack", qty: number, meta: Record<string, unknown>): Promise<void>;
  caseExport(caseId: string): Promise<CaseExport>;
}

export interface Result {
  path: string;
  meta: Record<string, unknown>;
}

const PDF = "application/pdf";

/** Per input file; a 25 MB filing limit leaves room for OCR growth but not for bombs. */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
export const MAX_ANNEXURE_PAGES = 300;

/** Job failure with a message that is safe to store and show (no names, paths or tool output). */
export class JobError extends Error {}

/**
 * The worker reads with the service role, which bypasses storage RLS, so it re-checks every
 * path against the job's own case folder (the database enforces the same rule on rows).
 */
export function caseStore(store: Store, job: Job): Store {
  const check = (path: string) => {
    if (!pathInCase(path, job.org_id, job.case_id)) throw new JobError("A file outside this case was referenced");
  };
  return {
    async download(path, bucket) {
      check(path);
      const body = await store.download(path, bucket);
      if (body.length > MAX_INPUT_BYTES) throw new JobError("An input file is larger than 40 MB");
      return body;
    },
    async upload(path, body, contentType, bucket) {
      check(path);
      await store.upload(path, body, contentType, bucket);
    },
  };
}

export async function runJob(job: Job, store: Store, db: Db): Promise<Result> {
  const s = caseStore(store, job);
  if (job.kind === "draft_pdf") return draftPdf(job, s, db);
  if (job.kind === "case_export") return caseExport(job, s, db);
  return efilingBundle(job, s, db);
}

/** Exports above this size are refused. Supabase Free caps uploads at 50 MB; Pro allows more. */
export const MAX_EXPORT_BYTES = Number(process.env.EXPORT_MAX_MB ?? 45) * 1024 * 1024;

/**
 * ZIP of the case: case.json (rows, ciphertext columns left out) plus every stored file under
 * files/<folder>/<name>. Written to the case's exports folder for the admin to download.
 */
async function caseExport(job: Job, store: Store, db: Db): Promise<Result> {
  const data = await db.caseExport(job.case_id);
  const entries: Record<string, Uint8Array> = {
    "case.json": strToU8(JSON.stringify({ exportedAt: new Date().toISOString(), caseNo: data.caseNo, ...data.tables }, null, 2)),
    "README.txt": strToU8(
      "Civil Suits case export.\n" +
        "case.json holds the case record, parties, loan, notices, mediation, drafts and document list.\n" +
        "Encrypted fields (OCR text, extracted values, PAN/account/DOB/phone) are not included; ask the\n" +
        "office admin for a decrypted export if it is needed.\nfiles/ holds every stored scan and draft.\n",
    ),
  };
  let bytes = 0;
  for (const path of [...new Set(data.files)]) {
    const body = await store.download(path);
    bytes += body.length;
    if (bytes > MAX_EXPORT_BYTES) throw new JobError("Case files exceed the export size limit");
    // files/<folder>/<name> — org and case ids are dropped from the archive paths.
    entries[`files/${path.split("/").slice(2).join("/")}`] = body;
  }
  const zip = Buffer.from(zipSync(entries, { level: 6 }));
  const name = `${data.caseNo.replace(/[^A-Za-z0-9-]+/g, "_").slice(0, 40)}_export.zip`;
  const path = `${job.org_id}/${job.case_id}/exports/${job.id}/${name}`;
  await store.upload(path, zip, "application/zip", "case-exports");
  return { path, meta: { fileName: name, bytes: zip.length, files: data.files.length } };
}

/** Draft DOCX → PDF/A-2b stored next to the DOCX. */
async function draftPdf(job: Job, store: Store, db: Db): Promise<Result> {
  const versionId = String(job.payload.draft_version_id ?? "");
  const v = await db.draftVersion(versionId);
  if (!v) throw new JobError("Draft version not found");
  return withTempDir(async (dir) => {
    const pdf = await docxToPdfA(await store.download(v.docxPath), dir);
    const check = await inspect(pdf);
    if (check.pdfaPart !== "2") throw new JobError("Conversion did not produce PDF/A-2");
    const path = v.docxPath.replace(/\.docx$/i, "") + ".pdf";
    await store.upload(path, await readFile(pdf), PDF);
    return { path, meta: { pages: check.pageCount, bytes: check.bytes } };
  });
}

interface Annexure {
  document_id: string;
  title: string;
}

function isPdf(buf: Buffer) {
  return buf.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Index → plaint → annexures → vakalatnama → affidavit / SOT, one PDF/A-2b with bookmarks. */
async function efilingBundle(job: Job, store: Store, db: Db): Promise<Result> {
  const c = await db.caseForBundle(job.case_id);
  if (!c.caption.court) throw new JobError("Assign a court to the case first");
  if (!c.drafts.some((d) => d.kind === "plaint")) throw new JobError("The bundle needs the approved plaint");
  const caption: CaptionInput = {
    ...c.caption,
    court: { name: courtTitle(c.caption.court.name, c.caption.court.district), place: c.caption.court.district },
  };
  const annexures = (Array.isArray(job.payload.annexures) ? job.payload.annexures : []) as Annexure[];

  return withTempDir(async (dir) => {
    const files = new Map<string, string>();

    const drafts: BundlePart[] = [];
    for (const kind of DRAFT_ORDER) {
      const d = c.drafts.find((x) => x.kind === kind);
      if (!d) continue;
      const pdf = d.pdfPath
        ? await save(dir, `${kind}.pdf`, await store.download(d.pdfPath))
        : await docxToPdfA(await store.download(d.docxPath), dir, kind);
      files.set(kind, pdf);
      drafts.push({ key: kind, title: DRAFT_TITLE[kind as BundleDraftKind], pages: await pageCount(pdf) });
    }

    const annexParts: BundlePart[] = [];
    for (const [i, a] of annexures.entries()) {
      const doc = c.documents[a.document_id];
      if (!doc) throw new JobError("Annexure is not a document of this case");
      const raw = await store.download(doc.storagePath);
      const src = await save(dir, `annex-${i}-src${isPdf(raw) ? ".pdf" : ".img"}`, raw);
      if (isPdf(raw) && (await pageCount(src)) > MAX_ANNEXURE_PAGES) {
        throw new JobError(`Annexure ${exhibitMark(i)} has more than ${MAX_ANNEXURE_PAGES} pages`);
      }
      const pdf = await ocrScan(src, join(dir, `annex-${i}.pdf`), undefined, !isPdf(raw));
      const key = `annex-${i}`;
      files.set(key, pdf);
      annexParts.push({ key, title: a.title, pages: await pageCount(pdf), mark: exhibitMark(i) });
    }

    const parts = orderParts(drafts, annexParts);

    // The index lists page numbers that depend on its own length; settle in at most 3 passes.
    let indexPages = 1;
    let indexPdf = "";
    let planned = planPages(parts, indexPages);
    for (let pass = 0; pass < 3; pass++) {
      const model = buildBundleIndex({ ...caption, entries: planned });
      indexPdf = await docxToPdfA(await renderDocx(model), dir, `index-${pass}`);
      const n = await pageCount(indexPdf);
      if (n === indexPages) break;
      indexPages = n;
      planned = planPages(parts, indexPages);
    }

    const fileName = bundleFileName(c.caseNo);
    const out = join(dir, fileName);
    await mergePdfA([indexPdf, ...parts.map((p) => files.get(p.key)!)], planned, `${c.caseNo} — e-filing bundle`, dir, out);

    const check = await inspect(out);
    const problems = bundleProblems(check);
    if (problems.length) throw new JobError(`Bundle not fit to file: ${problems.join("; ")}`);

    const path = `${job.org_id}/${job.case_id}/filing/${job.id}/${fileName}`;
    await store.upload(path, await readFile(out), PDF);
    await db.logUsage(job, "suit_pack", 1, { pages: check.pageCount });
    return {
      path,
      meta: {
        fileName,
        pages: check.pageCount,
        bytes: check.bytes,
        entries: [{ title: "Index", from: 1, to: indexPages }, ...planned.map(({ title, from, to, mark }) => ({ title, from, to, mark }))],
      },
    };
  });
}

async function save(dir: string, name: string, body: Buffer) {
  const p = join(dir, name);
  await writeFile(p, body);
  return p;
}

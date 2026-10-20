import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { caseKey, classifyPage, groupPages, type PageClass } from "./classify";
import { JobError, type Store } from "./jobs";
import { extractPages, ocrScan, pageCount, pageText, withTempDir } from "./tools";
import { pathInCase } from "./bundle";

/** Bulk intake: one upload holding many loan files (see migration 20261022000000_batches). */

export const MAX_BATCH_PAGES = 300;
/** case-files bucket limit (eCourts per-document limit). */
export const MAX_CASE_FILE_BYTES = 25 * 1024 * 1024;

export interface Batch {
  id: string;
  org_id: string;
  storage_path: string;
  sha256: string;
  status: "splitting" | "applying";
  page_count: number | null;
  plan: { pages: number[]; case_id?: string | null; case_no?: string | null }[] | null;
  created_cases: Record<string, string>;
  created_by: string;
}

export interface ProposedPage {
  pageNo: number;
  class: PageClass;
  confidence: number;
  accountLast4: string | null;
  borrower: string | null;
  group: number;
}

export interface IntakeDb {
  savePages(batch: Batch, pages: ProposedPage[]): Promise<void>;
  /** Id of a case of the org with this number, or null. */
  caseByNumber(orgId: string, caseNo: string): Promise<string | null>;
  /** Creates the case for the batch's admin and records it in batches.created_cases[group]. */
  createCase(batch: Batch, group: number, caseNo: string): Promise<string>;
  caseInOrg(orgId: string, caseId: string): Promise<boolean>;
  /** Idempotent: does nothing if a document with this path already exists. */
  addDocument(batch: Batch, caseId: string, path: string, sha256: string, pages: number): Promise<void>;
  markApplied(batch: Batch): Promise<void>;
}

const BATCH_BUCKET = "case-batches";
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function batchPath(batch: Batch): string {
  const seg = batch.storage_path.split("/");
  if (seg.length !== 3 || seg[0] !== batch.org_id || seg[1] !== batch.id || [".", "..", ""].includes(seg[2]!)) {
    throw new JobError("Batch file path is invalid");
  }
  return batch.storage_path;
}

async function original(batch: Batch, store: Store, dir: string): Promise<string> {
  const body = await store.download(batchPath(batch), BATCH_BUCKET);
  if (body.length > 50 * 1024 * 1024) throw new JobError("The scan is larger than 50 MB");
  if (sha256(body) !== batch.sha256) throw new JobError("The stored scan does not match the upload checksum");
  if (body.subarray(0, 5).toString("latin1") !== "%PDF-") throw new JobError("The upload is not a PDF");
  const src = join(dir, "batch.pdf");
  await writeFile(src, body);
  const n = await pageCount(src);
  if (n > MAX_BATCH_PAGES) throw new JobError(`The scan has ${n} pages; the limit is ${MAX_BATCH_PAGES}`);
  return src;
}

/** Split → local OCR → classify and group in code → pages saved for the admin's review. */
export async function splitBatch(batch: Batch, store: Store, db: IntakeDb): Promise<number> {
  return withTempDir(async (dir) => {
    const src = await original(batch, store, dir);
    const ocr = await ocrScan(src, join(dir, "ocr.pdf"));
    const n = await pageCount(ocr);
    const keyed = [];
    for (let i = 1; i <= n; i++) {
      const text = await pageText(ocr, i);
      keyed.push({ pageNo: i, text, ...caseKey(text) });
    }
    const groups = groupPages(keyed);
    const pages: ProposedPage[] = keyed.map((p, i) => {
      const c = classifyPage(p.text);
      return {
        pageNo: p.pageNo,
        class: c.class,
        confidence: c.confidence,
        accountLast4: p.account ? p.account.slice(-4) : null,
        borrower: p.borrower,
        group: groups[i]!,
      };
    });
    await db.savePages(batch, pages);
    return n;
  });
}

/**
 * Confirmed split → one scan per group in the case's folder, new cases created as needed.
 * Everything that can fail on input (pages, sizes, target cases) is checked before the first
 * write, so a bad plan never leaves a half-applied batch.
 */
export async function applyBatch(batch: Batch, store: Store, db: IntakeDb): Promise<number> {
  const plan = batch.plan;
  const pageCountTotal = batch.page_count;
  if (!plan?.length || !pageCountTotal) throw new JobError("Batch has no confirmed plan");
  return withTempDir(async (dir) => {
    const src = await original(batch, store, dir);

    const prepared = [];
    for (const [i, g] of plan.entries()) {
      if (!Array.isArray(g.pages) || !g.pages.length || g.pages.some((p) => !Number.isInteger(p) || p < 1 || p > pageCountTotal)) {
        throw new JobError("Plan has invalid pages");
      }
      if (g.case_id) {
        if (!(await db.caseInOrg(batch.org_id, g.case_id))) throw new JobError("Plan points at a case outside this office");
      } else {
        // A case with this number that this batch did not create belongs to someone else.
        const mine = batch.created_cases[String(i)];
        const existing = await db.caseByNumber(batch.org_id, String(g.case_no));
        if (existing && existing !== mine) throw new JobError(`Case number ${g.case_no} was taken after the split was confirmed`);
      }
      const body = await readFile(await extractPages(src, g.pages, join(dir, `g${i + 1}.pdf`)));
      if (body.length > MAX_CASE_FILE_BYTES) throw new JobError(`Group ${i + 1} is larger than 25 MB; split it into smaller groups`);
      prepared.push({ i, g, body });
    }

    for (const { i, g, body } of prepared) {
      const caseId = g.case_id ?? batch.created_cases[String(i)] ?? (await db.createCase(batch, i, String(g.case_no)));
      const path = `${batch.org_id}/${caseId}/scans/batch-${batch.id.slice(0, 8)}-${i + 1}.pdf`;
      if (!pathInCase(path, batch.org_id, caseId)) throw new JobError("Invalid case path");
      const sha = sha256(body);
      try {
        await store.upload(path, body, "application/pdf");
      } catch (e) {
        // A retry after a partial run finds the same file already stored; anything else fails.
        const existing = await store.download(path).catch(() => null);
        if (!existing || sha256(existing) !== sha) throw e;
      }
      await db.addDocument(batch, caseId, path, sha, g.pages.length);
    }
    await db.markApplied(batch);
    return prepared.length;
  });
}

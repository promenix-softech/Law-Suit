import { efilingFileName } from "@civil-suits/domain";

/** One document in the bundle, in filing order. */
export interface BundlePart {
  key: string;
  title: string;
  pages: number;
  mark?: string | null;
}

export interface PlannedPart extends BundlePart {
  from: number;
  to: number;
}

/**
 * Bundle order (skill maharashtra-efiling-format): index → plaint → annexures (each
 * bookmarked) → vakalatnama → affidavit / statement of truth. Page numbers count the
 * index pages first.
 */
export const DRAFT_ORDER = ["plaint", "vakalatnama", "statement_of_truth", "affidavit"] as const;
export type BundleDraftKind = (typeof DRAFT_ORDER)[number];

export const DRAFT_TITLE: Record<BundleDraftKind, string> = {
  plaint: "Plaint",
  vakalatnama: "Vakalatnama",
  statement_of_truth: "Statement of truth",
  affidavit: "Affidavit in support",
};

export function orderParts(drafts: BundlePart[], annexures: BundlePart[]): BundlePart[] {
  const byKey = new Map(drafts.map((d) => [d.key, d]));
  const plaint = byKey.get("plaint");
  if (!plaint) throw new Error("The bundle needs the approved plaint");
  const tail = DRAFT_ORDER.slice(1).flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : []));
  return [plaint, ...annexures, ...tail];
}

/** Annexure marks A, B, … Z, AA, AB, … */
export function exhibitMark(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function planPages(parts: BundlePart[], indexPages: number): PlannedPart[] {
  if (indexPages < 1) throw new Error("The index needs at least one page");
  let next = indexPages + 1;
  return parts.map((p) => {
    if (!Number.isInteger(p.pages) || p.pages < 1) throw new Error(`${p.title} has no pages`);
    const planned = { ...p, from: next, to: next + p.pages - 1 };
    next = planned.to + 1;
    return planned;
  });
}

/** PDF text string as UTF-16BE hex, so Marathi titles survive in bookmarks. */
export function pdfHexString(text: string): string {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/** Ghostscript pdfmark program: one top-level bookmark per document, plus document info. */
export function pdfmarks(title: string, parts: PlannedPart[]): string {
  const lines = [`[ /Title ${pdfHexString(title)} /Creator (Civil Suits) /DOCINFO pdfmark`];
  lines.push(`[ /Title ${pdfHexString("Index")} /Page 1 /View [/XYZ null null null] /OUT pdfmark`);
  for (const p of parts) {
    const label = p.mark ? `Exhibit ${p.mark} – ${p.title}` : p.title;
    lines.push(`[ /Title ${pdfHexString(label)} /Page ${p.from} /View [/XYZ null null null] /OUT pdfmark`);
  }
  return lines.join("\n") + "\n";
}

/** PDF/A-2b definition for Ghostscript (adapted from its PDFA_def.ps; sRGB output intent). */
export function pdfaDefinition(iccPath: string): string {
  if (/[()\\]/.test(iccPath)) throw new Error("Unsupported ICC profile path");
  return `/ICCProfile (${iccPath}) def
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} << /N 3 >> /PUT pdfmark
[{icc_PDFA} ICCProfile (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} << /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {icc_PDFA} /OutputConditionIdentifier (sRGB) >> /PUT pdfmark
[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
`;
}

export const MAX_DOC_BYTES = 25 * 1024 * 1024;

export interface BundleCheck {
  bytes: number;
  encrypted: boolean;
  pageCount: number;
  /** Page sizes in PDF points. */
  pageSizes: { w: number; h: number }[];
  pdfaPart: string | null;
}

/** Problems that would make the registry reject the file; empty when it is fit to file. */
export function bundleProblems(c: BundleCheck): string[] {
  const out: string[] = [];
  if (c.bytes > MAX_DOC_BYTES) out.push(`File is ${(c.bytes / 1048576).toFixed(1)} MB; the limit is 25 MB`);
  if (c.encrypted) out.push("File is encrypted");
  if (c.pdfaPart !== "2") out.push("File is not PDF/A-2");
  const notA4 = c.pageSizes.findIndex(({ w, h }) => !isA4(w, h));
  if (notA4 >= 0) out.push(`Page ${notA4 + 1} is not A4`);
  if (c.pageSizes.length !== c.pageCount) out.push("Page count mismatch");
  return out;
}

/** A4 = 595 × 842 pt, either orientation, 2 pt tolerance. */
export function isA4(w: number, h: number): boolean {
  const [a, b] = w < h ? [w, h] : [h, w];
  return Math.abs(a - 595.28) <= 2 && Math.abs(b - 841.89) <= 2;
}

/** Same rule as SQL `path_in_case`: {org}/{case}/{folder…}/{file}, no dot or empty segments. */
export function pathInCase(path: string, orgId: string, caseId: string): boolean {
  const seg = path.split("/");
  return seg.length >= 4 && seg[0] === orgId && seg[1] === caseId && seg.every((s) => s !== "" && s !== "." && s !== "..");
}

export function bundleFileName(caseNo: string, seq = 1): string {
  return efilingFileName(caseNo, "bundle", seq);
}

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
 * Bundle order as the office files it (skill bank-suit-house-style): index → plaint →
 * vakalatnama → list of documents → annexures (each bookmarked) → address memo → affidavit /
 * statement of truth. The draft decree is handed in separately, not in the bundle. Page
 * numbers count the index pages first.
 */
export const DRAFT_ORDER = ["plaint", "vakalatnama", "list_of_documents", "address_memo", "statement_of_truth", "affidavit"] as const;
export type BundleDraftKind = (typeof DRAFT_ORDER)[number];

export const DRAFT_TITLE: Record<BundleDraftKind, string> = {
  plaint: "Plaint",
  vakalatnama: "Vakalatnama",
  list_of_documents: "List of documents",
  address_memo: "Address memo",
  statement_of_truth: "Statement of truth",
  affidavit: "Affidavit in support of plaint",
};

/** Drafts that come before the annexures; the rest follow them. */
const BEFORE_ANNEXURES: readonly string[] = ["plaint", "vakalatnama", "list_of_documents"];

export function orderParts(drafts: BundlePart[], annexures: BundlePart[]): BundlePart[] {
  const byKey = new Map(drafts.map((d) => [d.key, d]));
  if (!byKey.has("plaint")) throw new Error("The bundle needs the approved plaint");
  const pick = (keys: readonly string[]) => keys.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : []));
  return [...pick(BEFORE_ANNEXURES), ...annexures, ...pick(DRAFT_ORDER.filter((k) => !BEFORE_ANNEXURES.includes(k)))];
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
  if (!Number.isInteger(indexPages) || indexPages < 0) throw new Error("Invalid number of index pages");
  let next = indexPages + 1;
  return parts.map((p) => {
    if (!Number.isInteger(p.pages) || p.pages < 1) throw new Error(`${p.title} has no pages`);
    const planned = { ...p, from: next, to: next + p.pages - 1 };
    next = planned.to + 1;
    return planned;
  });
}

/**
 * Ghostscript EndPage program that stamps the office's marks on the merged bundle, as the
 * clerk otherwise writes them by hand: the running page number "(n)" at the top right of
 * every page, and "Ann-A", "Ann-B" … beside it on the first page of each annexure.
 * Coordinates are A4 points (the merge fixes the media to A4).
 */
export function pageStampProgram(parts: PlannedPart[], totalPages: number): string {
  if (!Number.isInteger(totalPages) || totalPages < 1) throw new Error("The bundle has no pages");
  const labels: string[] = Array.from({ length: totalPages }, () => "");
  for (const p of parts) {
    if (!p.mark) continue;
    if (!/^[A-Z]{1,3}$/.test(p.mark)) throw new Error(`Bad annexure mark: ${p.mark}`);
    if (p.from >= 1 && p.from <= totalPages) labels[p.from - 1] = `Ann-${p.mark}`;
  }
  return [
    // The page number comes from EndPage's own showpage count: each input PDF runs inside
    // save/restore, so a counter kept in VM would be rolled back after every file.
    "userdict /CsStamp 4 dict put",
    "userdict /CsStamp get begin /CsLabels [" + labels.map((l) => `(${l})`).join(" ") + "] def end",
    "<< /EndPage {",
    "  2 lt {",
    "    userdict /CsStamp get begin",
    "    /CsPage exch 1 add def",
    "    gsave 0 setgray /Times-Bold findfont 12 scalefont setfont",
    "    /CsNum CsPage 20 string cvs def",
    "    555 (\\() stringwidth pop sub CsNum stringwidth pop sub (\\)) stringwidth pop sub 812 moveto",
    "    (\\() show CsNum show (\\)) show",
    "    CsPage CsLabels length le {",
    "      CsLabels CsPage 1 sub get dup length 0 gt { 470 812 moveto show } { pop } ifelse",
    "    } if",
    "    grestore end true",
    "  } { pop false } ifelse",
    "} bind >> setpagedevice",
    "",
  ].join("\n");
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
  // The system's own index is optional; when present it fills the pages before the first part.
  if ((parts[0]?.from ?? 1) > 1) lines.push(`[ /Title ${pdfHexString("Index")} /Page 1 /View [/XYZ null null null] /OUT pdfmark`);
  for (const p of parts) {
    const label = p.mark ? `Annexure ${p.mark} – ${p.title}` : p.title;
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

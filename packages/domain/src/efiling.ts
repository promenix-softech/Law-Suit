/** Bombay HC e-Filing Rules 2022: file names must be ≤ 45 characters. */
export const EFILING_MAX_FILENAME = 45;

export type DocKind =
  | "plaint"
  | "vakalatnama"
  | "affidavit"
  | "statement_of_truth"
  | "demand_notice"
  | "bbe_certificate"
  | "mediation_12a"
  | "annexure"
  | "list_of_documents"
  | "bundle"
  | "original_application";

const DOC_ABBR: Record<DocKind, string> = {
  plaint: "PLAINT",
  vakalatnama: "VAKALAT",
  affidavit: "AFFIDAVIT",
  statement_of_truth: "SOT",
  demand_notice: "NOTICE",
  bbe_certificate: "BBE_CERT",
  mediation_12a: "MED12A",
  annexure: "ANNEX",
  list_of_documents: "LIST_DOCS",
  bundle: "BUNDLE",
  original_application: "OA",
};

function asciiSafe(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

/**
 * Builds an ASCII-safe e-filing name like `CS-2026-0042_PLAINT_01.pdf`, trimming the
 * case number (never the doc kind or extension) to stay within 45 characters.
 */
export function efilingFileName(caseNo: string, docKind: DocKind, seq = 1, ext = "pdf"): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) throw new RangeError("seq must be 1–99");
  const suffix = `_${DOC_ABBR[docKind]}_${String(seq).padStart(2, "0")}.${ext}`;
  const room = EFILING_MAX_FILENAME - suffix.length;
  const casePart = asciiSafe(caseNo).slice(0, room).replace(/_$/, "");
  if (!casePart) throw new RangeError("caseNo has no ASCII-safe characters");
  return casePart + suffix;
}

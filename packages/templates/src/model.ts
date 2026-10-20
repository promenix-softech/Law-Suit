/**
 * Format-neutral document model. Templates produce this; renderers (DOCX now, PDF/A in the
 * worker later) turn it into files. Keeping legal text here, not in renderers, means one
 * versioned source per document.
 */
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "center"; lines: string[]; bold?: boolean }
  | { kind: "para"; text: string; legalReview?: boolean }
  | { kind: "fields"; rows: [label: string, value: string][] }
  | { kind: "list"; items: string[] }
  | { kind: "signature"; lines: string[] }
  /** Bordered boxes side by side, e.g. stamps to be affixed. */
  | { kind: "boxes"; items: string[] }
  /** Blank vertical space, e.g. the top of a stamp-paper page. */
  | { kind: "spacer"; lines: number; note?: string }
  /** Ruled table with a header row; widths are percentages. */
  | { kind: "table"; head: string[]; rows: string[][]; widths: number[] };

export interface DocModel {
  templateId: string;
  version: number;
  effectiveFrom: string;
  legalBasis: string;
  title: string;
  /** Right-aligned header lines (ref no., date). */
  meta: string[];
  /** Addressee block (letters); empty for pleadings. */
  to: string[];
  blocks: Block[];
}

export const LEGAL_REVIEW = "[[LEGAL_REVIEW]]";

/** Plain-text rendering, used for golden tests and quick previews. */
export function toPlainText(doc: DocModel): string {
  const out: string[] = doc.title ? [doc.title, ""] : [];
  if (doc.meta.length) out.push(...doc.meta, "");
  if (doc.to.length) out.push("To,", ...doc.to, "");
  for (const b of doc.blocks) {
    if (b.kind === "heading") out.push(b.text.toUpperCase());
    else if (b.kind === "center") out.push(...b.lines);
    else if (b.kind === "para") out.push(b.legalReview ? `${LEGAL_REVIEW} ${b.text}` : b.text);
    else if (b.kind === "fields") out.push(...b.rows.map(([k, v]) => `${k}: ${v}`));
    else if (b.kind === "list") out.push(...b.items.map((t, i) => `${i + 1}. ${t}`));
    else if (b.kind === "boxes") out.push(b.items.map((t) => `[ ${t} ]`).join("   "));
    else if (b.kind === "spacer") out.push(b.note ? `(${b.note})` : "");
    else if (b.kind === "table") out.push(...[b.head, ...b.rows].map((r) => r.join(" | ")));
    else out.push(...b.lines);
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

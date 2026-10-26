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
  /** Numbered list; "alpha" prints a), b), … as in the plaint's lists of executed documents. */
  | { kind: "list"; items: string[]; style?: "decimal" | "alpha" }
  | { kind: "signature"; lines: string[] }
  /** Tightly spaced lines, e.g. the party blocks of a caption ("...PLAINTIFF" is align right). */
  | { kind: "lines"; lines: string[]; align?: "left" | "center" | "right"; bold?: boolean; indent?: boolean }
  /** Two signature columns side by side: advocate on the left, party on the right. */
  | { kind: "sign2"; left: string[]; right: string[] }
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
  /** Page format profile; default "efiling" (civil/commercial courts). "letter" = not filed in court. */
  layout?: "efiling" | "drt" | "letter";
  /** Printed at the top right of every page (office style: "AFFIDAVIT", "DECREE"). */
  runningHeader?: string;
  /** "Page X of Y" in the footer of every page. */
  pageNumbers?: boolean;
  /** Office letterhead repeated at the top of every page (first line is the firm name). */
  letterhead?: string[];
}

const ALPHA = "abcdefghijklmnopqrstuvwxyz";
/** a, b, … z, aa, ab … — sub-items of a paragraph. */
export const alphaMark = (i: number): string => (i < 26 ? ALPHA[i]! : alphaMark(Math.floor(i / 26) - 1) + ALPHA[i % 26]!);

export const LEGAL_REVIEW = "[[LEGAL_REVIEW]]";

/** Plain-text rendering, used for golden tests and quick previews. */
export function toPlainText(doc: DocModel): string {
  const out: string[] = doc.runningHeader ? [`[page header: ${doc.runningHeader}]`, ""] : [];
  if (doc.letterhead?.length) out.push(...doc.letterhead.map((l) => `[letterhead] ${l}`), "");
  if (doc.title) out.push(doc.title, "");
  if (doc.meta.length) out.push(...doc.meta, "");
  if (doc.to.length) out.push("To,", ...doc.to, "");
  for (const b of doc.blocks) {
    if (b.kind === "heading") out.push(b.text.toUpperCase());
    else if (b.kind === "center") out.push(...b.lines);
    else if (b.kind === "para") out.push(b.legalReview ? `${LEGAL_REVIEW} ${b.text}` : b.text);
    else if (b.kind === "fields") out.push(...b.rows.map(([k, v]) => `${k}: ${v}`));
    else if (b.kind === "list") out.push(...b.items.map((t, i) => (b.style === "alpha" ? `${alphaMark(i)}) ${t}` : `${i + 1}. ${t}`)));
    else if (b.kind === "lines") out.push(...b.lines.map((l) => (b.align === "right" ? `>> ${l}` : b.indent ? `   ${l}` : l)));
    else if (b.kind === "sign2") {
      for (let i = 0; i < Math.max(b.left.length, b.right.length); i++) {
        out.push(`${b.left[i] ?? ""}${b.right[i] ? `${b.left[i] ? "    " : ""}>> ${b.right[i]}` : ""}`.trimEnd());
      }
    }
    else if (b.kind === "boxes") out.push(b.items.map((t) => `[ ${t} ]`).join("   "));
    else if (b.kind === "spacer") out.push(b.note ? `(${b.note})` : "");
    else if (b.kind === "table") out.push(...[b.head, ...b.rows].map((r) => r.join(" | ")));
    else out.push(...b.lines);
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

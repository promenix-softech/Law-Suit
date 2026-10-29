/**
 * Plain-text editing of a DOCX body (word/document.xml) without touching its formatting: each
 * paragraph's text is read from its text runs, and an edited paragraph gets its new text in its
 * first run (keeping that run's font, bold, size …) with the other runs emptied. Paragraphs that
 * hold anything besides plain text runs (tabs, breaks, fields, pictures) are read-only, so an edit
 * can never break their layout.
 *
 * The XML comes from an uploaded file, so it is read with a single linear pass over the tags (no
 * backtracking patterns) and refused when its paragraphs or text runs do not nest properly.
 */

export type DocParagraph = { index: number; text: string; editable: boolean };

type Run = { openStart: number; openEnd: number; attrs: string; closeStart: number; closeEnd: number };
type Para = { start: number; end: number; runs: Run[] };

/** <w:p …>, </w:p>, <w:p/>, <w:t …>, </w:t>, <w:t/>; `[^<>]*` stops at the next tag, so the scan is linear. */
const TAG = /<(\/?)w:(p|t)(?=[\s/>])([^<>]*)>/g;
/** Anything in a paragraph that plain text cannot represent. */
const NOT_PLAIN = /<w:(?:tab|br|cr|fldChar|fldSimple|instrText|drawing|pict|object|sym|footnoteReference|endnoteReference|txbxContent)[\s/>]/;

export class DocxTextError extends Error {}

const quotes = (s: string, q: string) => s.split(q).length - 1;

function scan(xml: string): Para[] {
  const paras: Para[] = [];
  let depth = 0;
  let current: Para | null = null;
  let open: Omit<Run, "closeStart" | "closeEnd"> | null = null;
  for (const m of xml.matchAll(TAG)) {
    const [whole, close, name, rest] = m;
    const start = m.index;
    const end = start + whole.length;
    const selfClosing = rest.endsWith("/");
    // A ">" inside a quoted attribute would cut the tag short: refuse such a document.
    if (quotes(rest, '"') % 2 || quotes(rest, "'") % 2) throw new DocxTextError("The document is not valid Word XML.");
    if (name === "p") {
      if (open) throw new DocxTextError("The document is not valid Word XML.");
      if (close) {
        if (depth === 0) throw new DocxTextError("The document is not valid Word XML.");
        depth -= 1;
        if (depth === 0 && current) {
          current.end = end;
          paras.push(current);
          current = null;
        }
      } else if (selfClosing) {
        if (depth === 0) paras.push({ start, end, runs: [] });
      } else {
        if (depth === 0) current = { start, end: -1, runs: [] };
        depth += 1;
      }
    } else if (depth > 0) {
      // Text runs of the paragraph itself (depth 1); text boxes inside it make it read-only anyway.
      if (close) {
        if (!open) throw new DocxTextError("The document is not valid Word XML.");
        if (depth === 1 && current) current.runs.push({ ...open, closeStart: start, closeEnd: end });
        open = null;
      } else if (selfClosing) {
        if (open) throw new DocxTextError("The document is not valid Word XML.");
        if (depth === 1 && current) current.runs.push({ openStart: start, openEnd: end, attrs: rest.slice(0, -1), closeStart: end, closeEnd: end });
      } else {
        if (open) throw new DocxTextError("The document is not valid Word XML.");
        open = { openStart: start, openEnd: end, attrs: rest };
      }
    }
  }
  if (depth !== 0 || open) throw new DocxTextError("The document is not valid Word XML.");
  return paras;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d{1,7});/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n) => safeChar(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
const safeChar = (cp: number) => (cp <= 0x10ffff ? String.fromCodePoint(cp) : "");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const runText = (xml: string, r: Run) => (r.closeStart > r.openEnd ? decode(xml.slice(r.openEnd, r.closeStart)) : "");

export function docxParagraphs(xml: string): DocParagraph[] {
  return scan(xml).map((p, index) => ({
    index,
    text: p.runs.map((r) => runText(xml, r)).join(""),
    editable: p.runs.length > 0 && !NOT_PLAIN.test(xml.slice(p.start, p.end)),
  }));
}

/** Characters Word cannot store: XML 1.0 control characters, non-characters, lone surrogates. */
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Applies `edits` (paragraph index → new text). Throws DocxTextError on an unknown or read-only
 * paragraph, on line breaks or characters Word cannot hold; returns the new XML.
 */
export function applyParagraphEdits(xml: string, edits: Map<number, string>): string {
  const paras = scan(xml);
  for (const [i, text] of edits) {
    const p = paras[i];
    if (!p) throw new DocxTextError(`Paragraph ${i + 1} does not exist.`);
    if (!p.runs.length || NOT_PLAIN.test(xml.slice(p.start, p.end))) throw new DocxTextError(`Paragraph ${i + 1} cannot be edited here.`);
    if (/[\r\n]/.test(text) || BAD_CHARS.test(text)) throw new DocxTextError(`Paragraph ${i + 1} has a line break or an invalid character.`);
  }
  // Rebuild once, left to right, replacing only the text runs of edited paragraphs.
  let out = "";
  let at = 0;
  paras.forEach((p, i) => {
    if (!edits.has(i)) return;
    p.runs.forEach((r, k) => {
      out += xml.slice(at, r.openStart);
      if (k === 0) {
        const attrs = r.attrs.replace(/\s*xml:space\s*=\s*"[^"]*"/, "");
        out += `<w:t${attrs} xml:space="preserve">${encode(edits.get(i)!)}</w:t>`;
      } else {
        out += "<w:t/>";
      }
      at = r.closeEnd;
    });
  });
  return out + xml.slice(at);
}

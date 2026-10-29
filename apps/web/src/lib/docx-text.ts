/**
 * Plain-text editing of a DOCX body (word/document.xml) without touching its formatting: each
 * paragraph's text is read from its text runs, and an edited paragraph gets its new text in its
 * first run (keeping that run's font, bold, size …) with the other runs emptied. Paragraphs that
 * hold anything besides plain text runs (tabs, breaks, fields, pictures) are read-only, so an edit
 * can never break their layout.
 */

export type DocParagraph = { index: number; text: string; editable: boolean };

/** A paragraph: empty (<w:p/>) or with content. `\b` keeps <w:pPr>, <w:proofErr> … out. */
const PARAGRAPH = /<w:p\b[^>]*\/>|<w:p\b(?:[^>]*[^/>])?>[\s\S]*?<\/w:p>/g;
const TEXT_RUN = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>|<w:t\b[^>]*\/>/g;
/** Anything in a paragraph that plain text cannot represent. */
const NOT_PLAIN = /<w:(?:tab|br|cr|fldChar|fldSimple|instrText|drawing|pict|object|sym|footnoteReference|endnoteReference|txbxContent)\b/;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function paragraphText(p: string): string {
  let text = "";
  for (const m of p.matchAll(TEXT_RUN)) text += m[2] ? decode(m[2]) : "";
  return text;
}

export function docxParagraphs(xml: string): DocParagraph[] {
  return [...xml.matchAll(PARAGRAPH)].map((m, index) => {
    const p = m[0];
    const hasRun = /<w:t\b/.test(p);
    return { index, text: paragraphText(p), editable: hasRun && !NOT_PLAIN.test(p) };
  });
}

/** Characters Word cannot store (XML 1.0 forbids most control characters). */
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;

/**
 * Applies `edits` (paragraph index → new text). Throws on an unknown or read-only paragraph, on
 * line breaks or characters Word cannot hold; returns the new XML.
 */
export function applyParagraphEdits(xml: string, edits: Map<number, string>): string {
  const paragraphs = docxParagraphs(xml);
  for (const [i, text] of edits) {
    const p = paragraphs[i];
    if (!p) throw new Error(`Paragraph ${i + 1} does not exist.`);
    if (!p.editable) throw new Error(`Paragraph ${i + 1} cannot be edited here.`);
    if (/[\r\n]/.test(text) || BAD_CHARS.test(text)) throw new Error(`Paragraph ${i + 1} has a line break or an invalid character.`);
  }
  let index = -1;
  return xml.replace(PARAGRAPH, (p) => {
    index += 1;
    if (!edits.has(index)) return p;
    const text = edits.get(index)!;
    let first = true;
    return p.replace(TEXT_RUN, (_run, attrs: string | undefined) => {
      if (!first) return "<w:t/>";
      first = false;
      const keep = (attrs ?? "").replace(/\s*xml:space="[^"]*"/, "");
      return `<w:t${keep} xml:space="preserve">${encode(text)}</w:t>`;
    });
  });
}

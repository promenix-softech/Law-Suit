import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { applyParagraphEdits, docxParagraphs } from "./docx-text";

describe("a generated plaint (synthetic sample)", () => {
  it("lists its paragraphs, most editable, and survives an edit round trip", async () => {
    const file = readFileSync(new URL("../../../../docs/samples/suit-set/01-plaint-summary-suit-synthetic.docx", import.meta.url));
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml")!.async("string");
    const paras = docxParagraphs(xml);
    const editable = paras.filter((p) => p.editable && p.text.trim());
    expect(editable.length).toBeGreaterThan(30);
    const target = editable.find((p) => p.text.startsWith("1. That the Plaintiff"))!;
    expect(target).toBeDefined();
    const out = applyParagraphEdits(xml, new Map([[target.index, "1. That the Plaintiff is a nationalised bank."]]));
    zip.file("word/document.xml", out);
    const again = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }));
    const reread = docxParagraphs(await again.file("word/document.xml")!.async("string"));
    expect(reread[target.index].text).toBe("1. That the Plaintiff is a nationalised bank.");
    expect(reread.length).toBe(paras.length);
    expect(reread.filter((p, i) => i !== target.index && p.text !== paras[i].text)).toEqual([]);
  });
});

const XML = [
  '<w:document><w:body>',
  '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>IN THE COURT OF </w:t></w:r><w:r><w:t>CIVIL JUDGE</w:t></w:r></w:p>',
  '<w:p><w:r><w:t xml:space="preserve">1. That the Plaintiff &amp; Co. </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>is a bank.</w:t></w:r></w:p>',
  "<w:p><w:r><w:t>Place</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Date</w:t></w:r></w:p>",
  "<w:p/>",
  '<w:p w14:paraId="1A"><w:r><w:t>Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p>',
  "</w:body></w:document>",
].join("");

describe("docxParagraphs", () => {
  it("reads each paragraph's text and marks what can be edited", () => {
    expect(docxParagraphs(XML)).toEqual([
      { index: 0, text: "IN THE COURT OF CIVIL JUDGE", editable: true },
      { index: 1, text: "1. That the Plaintiff & Co. is a bank.", editable: true },
      { index: 2, text: "PlaceDate", editable: false },
      { index: 3, text: "", editable: false },
      { index: 4, text: "Page ", editable: false },
    ]);
  });
});

describe("applyParagraphEdits", () => {
  it("puts the new text in the first run, keeps its formatting and empties the rest", () => {
    const out = applyParagraphEdits(XML, new Map([[1, "1. That the Plaintiff <Bank> is a banking company."]]));
    expect(out).toContain('<w:t xml:space="preserve">1. That the Plaintiff &lt;Bank&gt; is a banking company.</w:t>');
    expect(out).toContain("<w:rPr><w:i/></w:rPr><w:t/>");
    expect(docxParagraphs(out)[1].text).toBe("1. That the Plaintiff <Bank> is a banking company.");
    // untouched paragraphs are byte-for-byte the same
    expect(out.startsWith(XML.slice(0, XML.indexOf("<w:p><w:r><w:t xml:space")))).toBe(true);
    expect(out.endsWith(XML.slice(XML.indexOf("<w:p><w:r><w:t>Place")))).toBe(true);
  });

  it("keeps the paragraph and run properties", () => {
    const out = applyParagraphEdits(XML, new Map([[0, "IN THE COURT OF THE CIVIL JUDGE (S.D.)"]]));
    expect(out).toContain('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">IN THE COURT OF THE CIVIL JUDGE (S.D.)</w:t>');
  });

  it("refuses read-only or missing paragraphs and text Word cannot hold", () => {
    expect(() => applyParagraphEdits(XML, new Map([[2, "x"]]))).toThrow(/cannot be edited/);
    expect(() => applyParagraphEdits(XML, new Map([[4, "x"]]))).toThrow(/cannot be edited/);
    expect(() => applyParagraphEdits(XML, new Map([[9, "x"]]))).toThrow(/does not exist/);
    expect(() => applyParagraphEdits(XML, new Map([[0, "two\nlines"]]))).toThrow(/line break/);
    expect(() => applyParagraphEdits(XML, new Map([[0, "bell\u0007"]]))).toThrow(/invalid character/);
  });

  it("does nothing without edits", () => {
    expect(applyParagraphEdits(XML, new Map())).toBe(XML);
  });

  it("refuses lone surrogates", () => {
    expect(() => applyParagraphEdits(XML, new Map([[0, "bad \uD800 half"]]))).toThrow(/invalid character/);
    expect(applyParagraphEdits(XML, new Map([[0, "ok 😀 emoji"]]))).toContain("ok 😀 emoji");
  });
});

describe("hostile XML", () => {
  it("reads pathological input in linear time and refuses broken nesting", () => {
    const unclosed = "<w:p>".repeat(200_000);
    const t0 = Date.now();
    expect(() => docxParagraphs(unclosed)).toThrow(/not valid/);
    expect(() => docxParagraphs("<w:p<w:p".repeat(200_000))).not.toThrow();
    expect(() => docxParagraphs("<w:p><w:t>" + "<w:t>".repeat(100_000))).toThrow(/not valid/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("refuses a text run left open or a stray closing tag", () => {
    expect(() => docxParagraphs("<w:p><w:r><w:t>open</w:r></w:p>")).toThrow(/not valid/);
    expect(() => docxParagraphs("</w:p>")).toThrow(/not valid/);
    expect(() => docxParagraphs('<w:p><w:r><w:t w:x="a>b">t</w:t></w:r></w:p>')).toThrow(/not valid/);
  });
});

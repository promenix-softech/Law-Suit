import "server-only";
import { AlignmentType, Document, Packer, Paragraph, TextRun, convertInchesToTwip } from "docx";
import { LEGAL_REVIEW, type DocModel } from "@civil-suits/templates";

// Bombay HC e-Filing Rules 2022: A4, Times New Roman 14, 1.5 spacing,
// margins top/bottom 1.5", left 1.75", right 1.0". See skill maharashtra-efiling-format.
const FONT = "Times New Roman";
const SIZE = 28; // half-points → 14 pt
const LINE = 360; // 240 = single → 1.5 spacing
const A4 = { width: 11906, height: 16838 }; // twips

const run = (text: string, opts: { bold?: boolean; highlight?: boolean } = {}) =>
  new TextRun({ text, font: FONT, size: SIZE, bold: opts.bold, highlight: opts.highlight ? "yellow" : undefined });

const para = (children: TextRun[], align?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
  new Paragraph({ children, alignment: align, spacing: { line: LINE, after: 120 } });

/** Renders a template DocModel as DOCX. [[LEGAL_REVIEW]] paragraphs are highlighted. */
export async function renderDocx(doc: DocModel): Promise<Buffer> {
  const children: Paragraph[] = [
    para([run(doc.title, { bold: true })], AlignmentType.CENTER),
    ...doc.meta.map((m) => para([run(m)], AlignmentType.RIGHT)),
    ...(doc.to.length ? [para([run("To,")]), ...doc.to.map((t) => para([run(t)]))] : []),
  ];

  for (const b of doc.blocks) {
    if (b.kind === "heading") children.push(para([run(b.text, { bold: true })]));
    else if (b.kind === "center") b.lines.forEach((l) => children.push(para([run(l, { bold: b.bold })], AlignmentType.CENTER)));
    else if (b.kind === "para")
      children.push(
        para(
          b.legalReview ? [run(`${LEGAL_REVIEW} `, { bold: true, highlight: true }), run(b.text)] : [run(b.text)],
          AlignmentType.JUSTIFIED,
        ),
      );
    else if (b.kind === "fields") b.rows.forEach(([k, v]) => children.push(para([run(`${k}: `, { bold: true }), run(v)])));
    else if (b.kind === "list") b.items.forEach((t, i) => children.push(para([run(`${i + 1}. ${t}`)])));
    else b.lines.forEach((l) => children.push(para([run(l)])));
  }

  const document = new Document({
    creator: "Civil Suits",
    title: doc.title,
    description: `${doc.templateId} v${doc.version}`,
    sections: [
      {
        properties: {
          page: {
            size: A4,
            margin: {
              top: convertInchesToTwip(1.5),
              bottom: convertInchesToTwip(1.5),
              left: convertInchesToTwip(1.75),
              right: convertInchesToTwip(1.0),
            },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}

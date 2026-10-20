import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";
import { LEGAL_REVIEW, type DocModel } from "./model";

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

const BOX_BORDER = { style: BorderStyle.SINGLE, size: 8, color: "000000" };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

/** Side-by-side bordered boxes (e.g. where stamps are affixed), separated by a gap column. */
function stampBoxes(labels: string[]): Table {
  const box = (label: string) =>
    new TableCell({
      width: { size: 2600, type: WidthType.DXA },
      borders: { top: BOX_BORDER, bottom: BOX_BORDER, left: BOX_BORDER, right: BOX_BORDER },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 600 }, children: [run(label)] }),
      ],
    });
  const gap = () =>
    new TableCell({
      width: { size: 400, type: WidthType.DXA },
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
      children: [new Paragraph({})],
    });
  return new Table({
    rows: [new TableRow({ children: labels.flatMap((l, i) => (i ? [gap(), box(l)] : [box(l)])) })],
  });
}

/** Text width between the e-filing margins (A4 minus 1.75" + 1.0"), in twips. */
const TEXT_WIDTH = A4.width - convertInchesToTwip(2.75);
const twips = (percent: number) => Math.round((TEXT_WIDTH * percent) / 100);

/** Bordered table, header row in bold; single spacing so long indexes stay compact. */
function ruledTable(head: string[], rows: string[][], widths: number[]): Table {
  const borders = { top: BOX_BORDER, bottom: BOX_BORDER, left: BOX_BORDER, right: BOX_BORDER };
  const row = (cells: string[], bold: boolean) =>
    new TableRow({
      tableHeader: bold,
      children: cells.map(
        (text, i) =>
          new TableCell({
            borders,
            width: { size: twips(widths[i] ?? 0), type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ spacing: { line: 240 }, children: [run(text, { bold })] })],
          }),
      ),
    });
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: widths.map(twips),
    rows: [row(head, true), ...rows.map((r) => row(r, false))],
  });
}

/** Renders a template DocModel as DOCX. [[LEGAL_REVIEW]] paragraphs are highlighted. */
export async function renderDocx(doc: DocModel): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    ...(doc.title ? [para([run(doc.title, { bold: true })], AlignmentType.CENTER)] : []),
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
    else if (b.kind === "boxes") children.push(stampBoxes(b.items), para([]));
    else if (b.kind === "spacer") {
      // Blank lines keep the stamp-paper area empty; the note is a small grey hint for the clerk.
      if (b.note) children.push(para([new TextRun({ text: b.note, font: FONT, size: 16, italics: true, color: "999999" })]));
      for (let i = 0; i < b.lines; i++) children.push(para([]));
    } else if (b.kind === "table") children.push(ruledTable(b.head, b.rows, b.widths), para([]));
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

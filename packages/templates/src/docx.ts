import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
  convertMillimetersToTwip,
} from "docx";
import { LEGAL_REVIEW, alphaMark, type DocModel } from "./model";

interface Profile {
  /** Half-points. */
  size: number;
  /** 240 = single spacing. */
  line: number;
  margin: { top: number; bottom: number; left: number; right: number };
}

const PROFILES: Record<NonNullable<DocModel["layout"]>, Profile> = {
  // Bombay HC e-Filing Rules 2022: A4, Times New Roman 14, 1.5 spacing,
  // margins top/bottom 1.5", left 1.75", right 1.0". See skill maharashtra-efiling-format.
  efiling: {
    size: 28,
    line: 360,
    margin: {
      top: convertInchesToTwip(1.5),
      bottom: convertInchesToTwip(1.5),
      left: convertInchesToTwip(1.75),
      right: convertInchesToTwip(1.0),
    },
  },
  // DRT Original Application: TNR 13, double spacing, left 5 cm, right 2.5 cm.
  drt: {
    size: 26,
    line: 480,
    margin: {
      top: convertInchesToTwip(1.5),
      bottom: convertInchesToTwip(1.5),
      left: convertMillimetersToTwip(50),
      right: convertMillimetersToTwip(25),
    },
  },
  // Letters and office papers not filed in court (demand notice, tax invoice):
  // TNR 12, 1.15 spacing, 1" all round so the text uses the page.
  letter: {
    size: 24,
    line: 276,
    margin: {
      top: convertInchesToTwip(1.0),
      bottom: convertInchesToTwip(1.0),
      left: convertInchesToTwip(1.0),
      right: convertInchesToTwip(1.0),
    },
  },
};

const FONT = "Times New Roman";
const A4 = { width: 11906, height: 16838 }; // twips
const BOX_BORDER = { style: BorderStyle.SINGLE, size: 8, color: "000000" };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

/**
 * Margins for court papers, an office setting chosen by its admin. "office": the margins of the
 * office's own filed papers (top/bottom 1.26", left 1.5", right 1.0"), accepted on e-filing;
 * "efiling_rules": the e-Filing Rules profile above.
 */
export type CourtMargins = "office" | "efiling_rules";

const OFFICE_MARGINS: Profile["margin"] = {
  top: convertInchesToTwip(1.26),
  bottom: convertInchesToTwip(1.26),
  left: convertInchesToTwip(1.5),
  right: convertInchesToTwip(1.0),
};

/** Renders a template DocModel as DOCX. [[LEGAL_REVIEW]] paragraphs are highlighted. */
export async function renderDocx(doc: DocModel, opts: { courtMargins?: CourtMargins } = {}): Promise<Buffer> {
  const base = PROFILES[doc.layout ?? "efiling"];
  const pf = (doc.layout ?? "efiling") === "efiling" && (opts.courtMargins ?? "office") === "office" ? { ...base, margin: OFFICE_MARGINS } : base;
  const textWidth = A4.width - pf.margin.left - pf.margin.right;
  const twips = (percent: number) => Math.round((textWidth * percent) / 100);

  const run = (text: string, opts: { bold?: boolean; highlight?: boolean } = {}) =>
    new TextRun({ text, font: FONT, size: pf.size, bold: opts.bold, highlight: opts.highlight ? "yellow" : undefined });
  const para = (children: TextRun[], align?: Align) =>
    new Paragraph({ children, alignment: align, spacing: { line: pf.line, after: 120 } });

  /** Side-by-side bordered boxes (e.g. where stamps are affixed), separated by a gap column. */
  const stampBoxes = (labels: string[]) => {
    const box = (label: string) =>
      new TableCell({
        width: { size: 2600, type: WidthType.DXA },
        borders: { top: BOX_BORDER, bottom: BOX_BORDER, left: BOX_BORDER, right: BOX_BORDER },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 600 }, children: [run(label)] })],
      });
    const gap = () =>
      new TableCell({
        width: { size: 400, type: WidthType.DXA },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
        children: [new Paragraph({})],
      });
    return new Table({ rows: [new TableRow({ children: labels.flatMap((l, i) => (i ? [gap(), box(l)] : [box(l)])) })] });
  };

  /** Bordered table, header row in bold; single spacing so long indexes stay compact. */
  const ruledTable = (head: string[], rows: string[][], widths: number[]) => {
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
      width: { size: textWidth, type: WidthType.DXA },
      columnWidths: widths.map(twips),
      rows: [row(head, true), ...rows.map((r) => row(r, false))],
    });
  };

  /** Borderless two-column block: advocate's signature left, party's right. */
  const signColumns = (left: string[], right: string[]) => {
    const cell = (lines: string[], align: Align) =>
      new TableCell({
        width: { size: Math.round(textWidth / 2), type: WidthType.DXA },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
        children: (lines.length ? lines : [""]).map((l) => new Paragraph({ alignment: align, spacing: { line: 276, after: 0 }, children: [run(l, { bold: !!l })] })),
      });
    return new Table({
      width: { size: textWidth, type: WidthType.DXA },
      columnWidths: [Math.round(textWidth / 2), Math.round(textWidth / 2)],
      rows: [new TableRow({ children: [cell(left, AlignmentType.LEFT), cell(right, AlignmentType.RIGHT)] })],
    });
  };

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
    else if (b.kind === "list")
      b.items.forEach((t, i) =>
        children.push(
          new Paragraph({
            children: [run(`${b.style === "alpha" ? `${alphaMark(i)})` : `${i + 1}.`}\t${t}`)],
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: 1080, hanging: 360 },
            tabStops: [{ type: "left", position: 1080 }],
            spacing: { line: pf.line, after: 120 },
          }),
        ),
      );
    else if (b.kind === "lines") {
      // Caption-style lines: near-single spacing and no gap between them, as the office prints party blocks.
      const alignment = b.align === "right" ? AlignmentType.RIGHT : b.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
      for (const l of b.lines) {
        children.push(
          new Paragraph({ children: [run(l, { bold: b.bold })], alignment, indent: b.indent ? { left: 360 } : undefined, spacing: { line: 276, after: 0 } }),
        );
      }
      children.push(new Paragraph({ spacing: { line: 276, after: 0 }, children: [] }));
    }
    else if (b.kind === "sign2") children.push(signColumns(b.left, b.right), para([]));
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
        properties: { page: { size: A4, margin: pf.margin } },
        headers:
          doc.runningHeader || doc.letterhead?.length
            ? {
                default: new Header({
                  children: [
                    // Letterhead: firm name large and bold, then address lines small, as on the office's notices.
                    ...(doc.letterhead ?? []).map(
                      (l, i) =>
                        new Paragraph({
                          spacing: { after: 0 },
                          children: [new TextRun({ text: l, font: FONT, bold: i === 0, size: i === 0 ? 32 : 18 })],
                        }),
                    ),
                    ...(doc.runningHeader
                      ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(doc.runningHeader, { bold: true })] })]
                      : []),
                  ],
                }),
              }
            : undefined,
        footers: doc.pageNumbers
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ font: FONT, size: 20, children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES] }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}

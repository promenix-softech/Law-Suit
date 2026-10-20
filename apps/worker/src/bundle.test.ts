import { describe, expect, it } from "vitest";
import { bundleFileName, bundleProblems, exhibitMark, isA4, orderParts, pdfHexString, pdfmarks, planPages } from "./bundle";

const A4 = { w: 595.28, h: 841.89 };

describe("orderParts", () => {
  const d = (key: string) => ({ key, title: key, pages: 1 });
  it("puts the plaint first, annexures next, then vakalatnama and SOT", () => {
    const parts = orderParts([d("statement_of_truth"), d("vakalatnama"), d("plaint")], [d("annex-0"), d("annex-1")]);
    expect(parts.map((p) => p.key)).toEqual(["plaint", "annex-0", "annex-1", "vakalatnama", "statement_of_truth"]);
  });
  it("needs the plaint", () => {
    expect(() => orderParts([d("vakalatnama")], [])).toThrow(/plaint/);
  });
});

describe("planPages", () => {
  it("numbers pages after the index", () => {
    const p = planPages(
      [
        { key: "plaint", title: "Plaint", pages: 8 },
        { key: "a", title: "Loan agreement", pages: 1, mark: "A" },
      ],
      2,
    );
    expect(p.map(({ from, to }) => [from, to])).toEqual([
      [3, 10],
      [11, 11],
    ]);
  });
  it("rejects empty documents", () => {
    expect(() => planPages([{ key: "x", title: "X", pages: 0 }], 1)).toThrow();
  });
});

describe("exhibitMark", () => {
  it("runs A…Z then AA", () => {
    expect([0, 1, 25, 26, 27].map(exhibitMark)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });
});

describe("pdfmarks", () => {
  it("encodes titles as UTF-16 so Marathi survives", () => {
    expect(pdfHexString("अ")).toBe("<FEFF0905>");
  });
  it("adds one bookmark per document plus the index", () => {
    const marks = pdfmarks("CS-1", planPages([{ key: "p", title: "Plaint", pages: 3 }, { key: "a", title: "Deed", pages: 1, mark: "A" }], 1));
    expect(marks.match(/\/OUT pdfmark/g)).toHaveLength(3);
    expect(marks).toContain("/Page 5 ");
    expect(marks).toContain(pdfHexString("Exhibit A – Deed"));
  });
});

describe("bundleProblems", () => {
  const ok = { bytes: 1000, encrypted: false, pageCount: 2, pageSizes: [A4, A4], pdfaPart: "2" };
  it("passes a compliant file", () => {
    expect(bundleProblems(ok)).toEqual([]);
  });
  it("flags size, encryption, PDF/A and page size", () => {
    const p = bundleProblems({ ...ok, bytes: 30 * 1048576, encrypted: true, pdfaPart: null, pageSizes: [A4, { w: 612, h: 792 }] });
    expect(p).toHaveLength(4);
    expect(p.join(" ")).toMatch(/25 MB.*encrypted.*PDF\/A.*Page 2 is not A4/);
  });
  it("accepts landscape A4", () => {
    expect(isA4(841.89, 595.28)).toBe(true);
  });
});

describe("bundleFileName", () => {
  it("follows the e-filing name rule", () => {
    expect(bundleFileName("CS/2026/0042")).toBe("CS_2026_0042_BUNDLE_01.pdf");
  });
});

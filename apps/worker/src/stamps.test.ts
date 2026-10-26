import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pageStampProgram, type PlannedPart } from "./bundle";
import { mergePdfA, withTempDir } from "./tools";

const have = (cmd: string) => {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const parts: PlannedPart[] = [
  { key: "plaint", title: "Plaint", pages: 2, from: 2, to: 3 },
  { key: "annex-0", title: "Loan agreement", pages: 2, from: 4, to: 5, mark: "A" },
  { key: "annex-1", title: "Statement of account", pages: 1, from: 6, to: 6, mark: "B" },
];

describe("pageStampProgram", () => {
  it("labels the first page of each annexure and numbers every page", () => {
    const ps = pageStampProgram(parts, 6);
    expect(ps).toContain("/CsLabels [() () () (Ann-A) () (Ann-B)] def end");
    expect(ps).toContain("/EndPage");
  });

  it("refuses marks that are not plain letters (they go into PostScript)", () => {
    expect(() => pageStampProgram([{ ...parts[1]!, mark: "A) show (" }], 6)).toThrow(/mark/);
  });
});

describe.skipIf(!["gs", "qpdf", "pdftotext"].every(have))("bundle stamps (real Ghostscript)", () => {
  it("prints (n) on every page and Ann-X on each annexure's first page", async () => {
    await withTempDir(async (dir) => {
      // Blank synthetic inputs: index (1 page), plaint (2), annexure A (2), annexure B (1).
      const blank = (name: string, pages: number) => {
        const out = join(dir, name);
        execFileSync("gs", ["-q", "-dSAFER", "-sDEVICE=pdfwrite", "-sPAPERSIZE=a4", "-o", out, "-c", Array(pages).fill("showpage").join(" ")]);
        return out;
      };
      const inputs = [blank("i.pdf", 1), blank("p.pdf", 2), blank("a.pdf", 2), blank("b.pdf", 1)];
      const out = join(dir, "bundle.pdf");
      await mergePdfA(inputs, parts, "Synthetic bundle", dir, out);

      const page = (n: number) => execFileSync("pdftotext", ["-f", String(n), "-l", String(n), out, "-"]).toString();
      expect(page(1)).toContain("(1)");
      expect(page(3)).toContain("(3)");
      expect(page(4)).toContain("Ann-A");
      expect(page(4)).toContain("(4)");
      expect(page(5)).not.toContain("Ann-");
      expect(page(6)).toContain("Ann-B");
    });
  }, 120_000);
});

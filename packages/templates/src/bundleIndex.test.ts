import { describe, expect, it } from "vitest";
import { buildBundleIndex } from "./bundleIndex";
import type { CaptionInput } from "./caption";
import { renderDocx } from "./docx";
import { toPlainText } from "./model";

const base: CaptionInput = {
  court: { name: "Civil Judge Senior Division", place: "Pune" },
  year: 2026,
  suitType: "commercial",
  bank: { name: "State Bank of India", branch: "Demo Branch, Pune" },
  defendants: [{ name: "Vijay Sample Jadhav", role: "borrower", address: "Synthetic address, Pune" }],
};

describe("buildBundleIndex", () => {
  const entries = [
    { title: "Plaint", from: 2, to: 9 },
    { title: "Loan agreement", from: 10, to: 10, mark: "A" },
  ];

  it("lists entries with page ranges and exhibit marks", () => {
    const t = toPlainText(buildBundleIndex({ ...base, entries }));
    expect(t).toContain("Sr. No. | Particulars | Exhibit | Pages");
    expect(t).toContain("1 | Plaint |  | 2 – 9");
    expect(t).toContain("2 | Loan agreement | A | 10");
    expect(t).toContain("COMMERCIAL SUIT NO. __________/2026");
    expect(t).not.toContain("Synthetic address");
  });

  it("refuses an empty bundle", () => {
    expect(() => buildBundleIndex({ ...base, entries: [] })).toThrow();
  });

  it("renders to DOCX", async () => {
    const buf = await renderDocx(buildBundleIndex({ ...base, entries }));
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});

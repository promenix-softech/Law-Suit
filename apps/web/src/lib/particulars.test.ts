import { describe, expect, it } from "vitest";
import { formatDocumentLines, parseDocumentLines } from "./particulars";

describe("parseDocumentLines", () => {
  it("reads 'title | date', 'title dated date' and bare titles, skipping blank lines", () => {
    const r = parseDocumentLines("Demand Promissory Note | 12.07.2023\n\nGuarantee Agreement dated 12-07-2023.\nConsent letter");
    expect(r).toEqual({
      ok: true,
      docs: [
        { title: "Demand Promissory Note", date: "2023-07-12" },
        { title: "Guarantee Agreement", date: "2023-07-12" },
        { title: "Consent letter", date: null },
      ],
    });
  });

  it("reports the line of an unreadable date", () => {
    expect(parseDocumentLines("Agreement | 12.07.2023\nNote | 31.02.2023")).toEqual({ ok: false, line: 2 });
  });

  it("round-trips through the editable form", () => {
    const docs = [{ title: "Hypothecation Agreement", date: "2024-04-22" }, { title: "Consent letter", date: null }];
    expect(parseDocumentLines(formatDocumentLines(docs))).toEqual({ ok: true, docs });
  });
});

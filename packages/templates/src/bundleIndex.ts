import { caption, type CaptionInput } from "./caption";
import type { DocModel } from "./model";

export interface BundleEntry {
  title: string;
  /** First and last page of the entry in the final bundle (1-based, index page included). */
  from: number;
  to: number;
  /** Exhibit / annexure mark, e.g. "A". */
  mark?: string | null;
}

/**
 * Index for the e-filing bundle. Order and page ranges come from the worker's bundle plan;
 * the index itself carries no legal text, only the caption and the table.
 */
export function buildBundleIndex(input: CaptionInput & { entries: BundleEntry[] }): DocModel {
  if (!input.entries.length) throw new Error("The bundle has no documents");
  return {
    templateId: "bundle_index.en",
    version: 1,
    effectiveFrom: "2026-10-21",
    legalBasis: "Bombay High Court e-Filing Rules 2022 (index and bookmarks)",
    title: "",
    meta: [],
    to: [],
    blocks: [
      ...caption(input, { addresses: false }),
      { kind: "center", bold: true, lines: ["INDEX"] },
      {
        kind: "table",
        head: ["Sr. No.", "Particulars", "Exhibit", "Pages"],
        widths: [11, 55, 16, 18],
        rows: input.entries.map((e, i) => [
          String(i + 1),
          e.title,
          e.mark ?? "",
          e.from === e.to ? String(e.from) : `${e.from} – ${e.to}`,
        ]),
      },
    ],
  };
}

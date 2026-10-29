import { z } from "zod";
import { parseDocumentLine, type ExecutedDoc } from "./extract/fields";

export type { ExecutedDoc };

/** loans.executed_docs as stored (jsonb is free-form, so it is re-validated on every read). */
export const ExecutedDocsSchema = z.array(z.object({ title: z.string().trim().min(1).max(300), date: z.iso.date().nullable() })).max(60);

export const readExecutedDocs = (stored: unknown): ExecutedDoc[] => ExecutedDocsSchema.safeParse(stored).data ?? [];

/**
 * One document per line, as the clerk types it from the loan file:
 * "Demand Promissory Note | 12.07.2023", "Guarantee Agreement dated 12.07.2023", or a title alone.
 * Returns the line number of the first line it cannot read.
 */
export function parseDocumentLines(text: string): { ok: true; docs: ExecutedDoc[] } | { ok: false; line: number } {
  const docs: ExecutedDoc[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const doc = parseDocumentLine(lines[i]!);
    if (!doc) return { ok: false, line: i + 1 };
    docs.push(doc);
  }
  return docs.length > 60 ? { ok: false, line: 61 } : { ok: true, docs };
}

/** Back to the editable form: "Title | DD.MM.YYYY". */
export function formatDocumentLines(docs: ExecutedDoc[]): string {
  return docs.map((d) => (d.date ? `${d.title} | ${d.date.split("-").reverse().join(".")}` : d.title)).join("\n");
}

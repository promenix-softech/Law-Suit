/**
 * Checks an uploaded DOCX before anything inflates it. The ZIP central directory lists every
 * entry's uncompressed size, so a zip bomb or a huge document.xml is refused from those numbers
 * alone; parts Word uses for macros or embedded programs are refused too. Pure (bytes in).
 */

export const DOCX_LIMITS = {
  entries: 300,
  documentXml: 5 * 1024 * 1024,
  total: 60 * 1024 * 1024,
  rels: 1024 * 1024,
};

export type ZipEntry = { name: string; size: number; compressed: number };
export type DocxCheck = { ok: true; entries: ZipEntry[] } | { ok: false; error: string };

/** Parts that carry code or other programs: never accepted from an upload. */
const FORBIDDEN = /(^|\/)(vbaProject\.bin|vbaData\.xml)$|(^|\/)(activeX|embeddings)\/|oleObject/i;

function readEntries(bytes: Uint8Array): ZipEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: signature 0x06054b50, within the last 64 KB + 22 bytes.
  const stop = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) return null; // ZIP64: never produced by Word for a pleading
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) return null;
    const compressed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    if (p + 46 + nameLen > bytes.length) return null;
    entries.push({ name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)), size, compressed });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function inspectDocx(bytes: Uint8Array): DocxCheck {
  if (bytes.length < 30 || view4(bytes) !== 0x04034b50) return { ok: false, error: "That is not a Word (.docx) file." };
  const entries = readEntries(bytes);
  if (!entries) return { ok: false, error: "The Word file is damaged." };
  if (entries.length > DOCX_LIMITS.entries) return { ok: false, error: "The Word file has too many parts." };
  const body = entries.find((e) => e.name === "word/document.xml");
  if (!body) return { ok: false, error: "That is not a Word (.docx) file." };
  if (body.size > DOCX_LIMITS.documentXml) return { ok: false, error: "The document text is too large (over 5 MB)." };
  if (entries.reduce((s, e) => s + e.size, 0) > DOCX_LIMITS.total) return { ok: false, error: "The Word file is too large when unpacked." };
  if (entries.some((e) => e.name.endsWith(".rels") && e.size > DOCX_LIMITS.rels)) return { ok: false, error: "The Word file is damaged." };
  if (entries.some((e) => FORBIDDEN.test(e.name))) return { ok: false, error: "Word files with macros or embedded objects are not accepted." };
  return { ok: true, entries };
}

const view4 = (b: Uint8Array) => (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;

/** A relationship pointing outside the file (linked images, remote templates) — refused. */
export const EXTERNAL_TARGET = /TargetMode\s*=\s*["']External["']/i;

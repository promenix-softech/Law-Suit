import "server-only";
import { decryptText, encryptText } from "@/lib/crypto";

/**
 * The provider's job id of an OCR job is stored sealed (encrypted with the server's key) and bound
 * to its own row: a case editor can write to ocr_jobs through the API, but cannot make a value this
 * server will open — so a job can never be pointed at another Sarvam job, nor a sealed id copied
 * from another row.
 */
export const sealOcrJob = (rowId: string, jobId: string) => encryptText(`ocr:${rowId}:${jobId}`);

export function openOcrJob(rowId: string, sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const plain = decryptText(sealed);
    const prefix = `ocr:${rowId}:`;
    return plain.startsWith(prefix) && plain.length > prefix.length ? plain.slice(prefix.length) : null;
  } catch {
    return null;
  }
}

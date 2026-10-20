import "server-only";
import { decryptText, encryptText } from "@/lib/crypto";

/** Encrypted payload of an extracted_fields row. `stored` is null when validation failed. */
export type FieldPayload = { raw: string; stored: string | null; reason: string | null };

export function decodeField(valueEnc: string | null): FieldPayload | null {
  if (!valueEnc) return null;
  try {
    const v = JSON.parse(decryptText(valueEnc)) as FieldPayload;
    return typeof v?.raw === "string" ? v : null;
  } catch {
    return null;
  }
}

export const encodeField = (p: FieldPayload) => encryptText(JSON.stringify(p));

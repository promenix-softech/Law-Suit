import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption for *_enc columns (AES-256-GCM).
 * Stored layout: version(1) | iv(12) | tag(16) | ciphertext, sent to Postgres bytea as "\x<hex>".
 * Key: FIELD_ENCRYPTION_KEY, 32 random bytes, base64. Server-only; never logged.
 */
const VERSION = 1;

function key(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const out = Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
  return `\\x${out.toString("hex")}`;
}

/** Accepts the "\x<hex>" form PostgREST returns for bytea. */
export function decryptText(stored: string): string {
  const buf = Buffer.from(stored.replace(/^\\x/, ""), "hex");
  if (buf.length < 29 || buf[0] !== VERSION) throw new Error("Unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(1, 13));
  decipher.setAuthTag(buf.subarray(13, 29));
  return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]).toString("utf8");
}

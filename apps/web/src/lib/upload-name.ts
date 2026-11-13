/**
 * Names for files people upload. The original file name never reaches storage or the database:
 * it often carries the borrower's name or account number ("Patil loan 1234567890.pdf").
 * A stored name is `<epoch ms>-<random uuid>.<ext>`, the extension taken from the file type.
 */

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXT_FOR: Record<string, "pdf" | "jpg" | "png" | "docx"> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  [DOCX_MIME]: "docx",
};

const UPLOAD_NAME = /^(\d{13})-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|docx)$/;

/** A fresh stored name for a file of this type, or null for a type we do not accept. */
export function uploadName(mime: string, now: number = Date.now(), id: string = crypto.randomUUID()): string | null {
  const ext = EXT_FOR[mime];
  return ext ? `${now}-${id.toLowerCase()}.${ext}` : null;
}

/** True when the last part of `path` is a name made by `uploadName`, with one of `exts`. */
export function isUploadName(path: string, exts: readonly string[]): boolean {
  const m = UPLOAD_NAME.exec(path.split("/").pop() ?? "");
  return m !== null && exts.includes(m[2]!);
}

/**
 * True only for exactly `{org}/{case}/{folder}/<generated name>`: no extra folders in between,
 * where a person's file or folder name could still be carried.
 */
export function isCaseUpload(path: string, orgId: string, caseId: string, folder: string, exts: readonly string[]): boolean {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === orgId && parts[1] === caseId && parts[2] === folder && isUploadName(parts[3]!, exts);
}

const KIND_LABEL: Record<string, string> = { pdf: "PDF", jpg: "Photo", png: "Image", docx: "Word file" };

/**
 * What to show for a stored file. New uploads have no meaningful name, so they are shown by kind
 * ("PDF", "Photo"); files stored before this change keep the name they were uploaded with.
 */
export function fileLabel(path: string): string {
  const last = path.split("/").pop() ?? "";
  const m = UPLOAD_NAME.exec(last);
  if (m) return KIND_LABEL[m[2]!]!;
  return last.replace(/^\d+-/, "") || "File";
}

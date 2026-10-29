"use server";

import JSZip from "jszip";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CaseStatus } from "@civil-suits/domain";
import { applyParagraphEdits, DocxTextError, docxParagraphs, type DocParagraph } from "@/lib/docx-text";
import { DOCX_LIMITS, inspectDocx } from "@/lib/docx-zip";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

const BUCKET = "case-files";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BODY = "word/document.xml";
const SUIT_KINDS = new Set(["plaint", "original_application"]);
const SUIT_LOCKED: CaseStatus[] = ["notary_stamp", "efiling_ready", "filed", "listed", "disposed"];

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** The draft's latest version (RLS: only people who can see the case get it). */
async function latestVersion(supabase: Supabase, draftId: string) {
  const { data: d } = await supabase
    .from("drafts")
    .select("id, org_id, case_id, doc_kind, status, current_version, cases(id, status, needs_12a), draft_versions(id, version, docx_path)")
    .eq("id", draftId)
    .single();
  if (!d) return null;
  const v = (d.draft_versions ?? []).find((x) => x.version === d.current_version);
  return v?.docx_path ? { d, v: { ...v, docx_path: v.docx_path }, c: one(d.cases) as { id: string; status: CaseStatus; needs_12a: boolean } | null } : null;
}

/** Unzips a version only after its declared sizes pass the limits (no zip bombs, no huge XML). */
async function loadBody(supabase: Supabase, path: string): Promise<{ zip: JSZip; xml: string } | string> {
  const { data: blob } = await supabase.storage.from(BUCKET).download(path);
  if (!blob) return "The file could not be read.";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const check = inspectDocx(bytes);
  if (!check.ok) return check.error;
  try {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file(BODY)?.async("string");
    return xml && xml.length <= DOCX_LIMITS.documentXml ? { zip, xml } : "The file could not be read.";
  } catch {
    return "The file could not be read.";
  }
}

export type DraftText = { ok: true; versionId: string; version: number; paragraphs: DocParagraph[] } | { ok: false; error: string };

/** The paragraphs of the draft's latest version, for the in-browser editor. */
export async function loadDraftText(draftId: string): Promise<DraftText> {
  if (!z.uuid().safeParse(draftId).success) return { ok: false, error: "Invalid draft." };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };
  const found = await latestVersion(supabase, draftId);
  if (!found) return { ok: false, error: "This draft has no file yet." };
  const body = await loadBody(supabase, found.v.docx_path);
  if (typeof body === "string") return { ok: false, error: body };
  try {
    return { ok: true, versionId: found.v.id, version: found.v.version, paragraphs: docxParagraphs(body.xml) };
  } catch (e) {
    return { ok: false, error: e instanceof DocxTextError ? e.message : "The file could not be read." };
  }
}

const SaveInput = z.object({
  draftId: z.uuid(),
  /** The version the edits were made on: a newer one in between means someone else changed it. */
  baseVersionId: z.uuid(),
  note: z.string().trim().min(3).max(300),
  edits: z
    .array(z.object({ index: z.number().int().min(0).max(20000), text: z.string().max(5000) }))
    .min(1)
    .max(400),
});

/**
 * Saves edited paragraph text as the draft's next version. Formatting stays (see docx-text); the
 * editor counts as an editor for maker-checker, and an approved paper needs approval again.
 */
export async function saveDraftText(input: z.input<typeof SaveInput>): Promise<ActionResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Say in a few words what you changed (3–300 characters)." };
  const { draftId, baseVersionId, note, edits } = parsed.data;
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const found = await latestVersion(supabase, draftId);
  if (!found || !found.c) return { ok: false, error: "Draft not found." };
  const { d, v, c } = found;
  if (v.id !== baseVersionId) return { ok: false, error: "A newer version was saved meanwhile. Close the editor and open it again." };
  if (d.status === "in_approval") return { ok: false, error: "This paper is with the approver. Ask for it back before editing." };
  if (SUIT_KINDS.has(d.doc_kind) && SUIT_LOCKED.includes(c.status)) {
    return { ok: false, error: "The plaint has gone to the notary or the court; it can no longer be changed here." };
  }

  const body = await loadBody(supabase, v.docx_path);
  if (typeof body === "string") return { ok: false, error: body };
  let xml: string;
  try {
    xml = applyParagraphEdits(body.xml, new Map(edits.map((e) => [e.index, e.text])));
  } catch (e) {
    return { ok: false, error: e instanceof DocxTextError ? e.message : "Could not apply the changes." };
  }
  body.zip.file(BODY, xml);
  const file = await body.zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  const version = d.current_version + 1;
  const path = `${d.org_id}/${d.case_id}/drafts/${d.doc_kind}-edited-v${version}-${Date.now()}.docx`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: DOCX_MIME });
  if (up.error) return { ok: false, error: "You cannot edit drafts of this case." };
  const ver = await supabase.from("draft_versions").insert({
    org_id: d.org_id,
    draft_id: d.id,
    version,
    docx_path: path,
    diff_summary: `Edited in Civil Suits (${edits.length} paragraph${edits.length === 1 ? "" : "s"}): ${note}`,
  });
  if (ver.error) return { ok: false, error: "You cannot edit drafts of this case." };
  // A new plaint version on an approved case sends it back to drafting (database trigger).
  await supabase.from("drafts").update({ current_version: version, status: "draft" }).eq("id", d.id);

  revalidatePath(`/dashboard/cases/${d.case_id}`);
  return { ok: true, message: `Saved as v${version}. Submit it for approval when ready.` };
}

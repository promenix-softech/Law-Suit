"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { translator, type Lang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { generateDraft, recordCorrection, type ActionResult, type DocKind } from "./actions";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 10 * 1024 * 1024;

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="fade-up text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
  ) : (
    <p className="fade-up text-sm text-red-600 dark:text-red-400">{result.error}</p>
  );
}

/**
 * Generate a paper, or regenerate it from the current case data. Regenerating an approved paper
 * asks first: the new version needs a fresh approval.
 */
export function RegenerateDraft({
  caseId,
  kind,
  exists,
  approved,
  primary = false,
  lang,
}: {
  caseId: string;
  kind: DocKind;
  exists: boolean;
  approved: boolean;
  primary?: boolean;
  lang: Lang;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const go = () => {
    if (approved && !window.confirm(t("This paper is approved. A regenerated version must be approved again. Continue?"))) return;
    start(async () => {
      setResult(await generateDraft(caseId, kind));
      router.refresh();
    });
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={go} disabled={pending} className={`btn px-3 py-1.5 text-xs ${primary ? "btn-primary" : ""}`}>
        {pending ? `${t("Generating")}…` : exists ? `↻ ${t("Regenerate")}` : `✦ ${t("Generate")}`}
      </button>
      <Status result={result} />
    </span>
  );
}

/**
 * Upload a Word file corrected by hand as the paper's next version. The browser stores it in the
 * case's drafts folder (storage RLS decides), the server checks it is a real DOCX and records it.
 */
export function CorrectDraft({
  orgId,
  caseId,
  draftId,
  approved,
  lang,
}: {
  orgId: string;
  caseId: string;
  draftId: string;
  approved: boolean;
  lang: Lang;
}) {
  const t = translator(lang);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function save() {
    if (!file) return setResult({ ok: false, error: t("Choose the corrected Word file.") });
    if (!file.name.toLowerCase().endsWith(".docx")) return setResult({ ok: false, error: t("Only Word (.docx) files.") });
    if (file.size > MAX_BYTES) return setResult({ ok: false, error: t("The Word file is larger than 10 MB.") });
    if (note.trim().length < 3) return setResult({ ok: false, error: t("Say in a few words what you corrected.") });
    setBusy(true);
    setResult(null);
    try {
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-60);
      const path = `${orgId}/${caseId}/drafts/corrected-${Date.now()}-${safe}`;
      const up = await createClient().storage.from("case-files").upload(path, file, { contentType: DOCX_MIME });
      if (up.error) return setResult({ ok: false, error: t("Upload not allowed for this case.") });
      const r = await recordCorrection({ draftId, path, note });
      setResult(r);
      if (r.ok) {
        setOpen(false);
        setFile(null);
        setNote("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <span className="inline-flex flex-col gap-1">
        <button type="button" className="btn px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
          ✎ {t("Upload corrected Word file")}
        </button>
        <Status result={result} />
      </span>
    );
  }
  return (
    <div className="fade-up mt-2 w-full space-y-2 rounded-2xl border border-current/10 p-3">
      <p className="muted text-xs">
        {t("Download the DOCX, correct it in Word, then upload it here. It becomes the next version.")}
        {approved && <span className="font-medium text-amber-700 dark:text-amber-300"> {t("It will need approval again.")}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn cursor-pointer px-3 py-1.5 text-xs">
          <input ref={input} type="file" accept=".docx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? `📄 ${file.name.slice(0, 32)}` : t("Choose Word file…")}
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder={t("What did you correct? (e.g. borrower's address)")}
          className="input-glass min-w-56 flex-1 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy} className="btn btn-primary px-3 py-1.5 text-xs" onClick={save}>
          {busy ? `${t("Uploading…")}` : t("Save as new version")}
        </button>
        <button type="button" disabled={busy} className="btn px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
          {t("Cancel")}
        </button>
      </div>
      <Status result={result} />
    </div>
  );
}

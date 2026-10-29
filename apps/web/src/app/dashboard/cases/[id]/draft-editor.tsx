"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { translator, type Lang } from "@/lib/i18n";
import type { DocParagraph } from "@/lib/docx-text";
import { loadDraftText, saveDraftText } from "./draft-text-actions";

type Loaded = { versionId: string; version: number; paragraphs: DocParagraph[] };

/**
 * Edit a paper's wording in the browser: every paragraph of the latest version as a text box.
 * Saving makes the next version (formatting kept); paragraphs with tabs, fields or pictures are
 * shown but locked — those are changed in Word and uploaded instead.
 */
export function EditDraftText({ draftId, heading, approved, lang }: { draftId: string; heading: string; approved: boolean; lang: Lang }) {
  const t = translator(lang);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
        ✎ {t("Edit text")}
      </button>
      {open && createPortal(<Editor draftId={draftId} heading={heading} approved={approved} lang={lang} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Editor({ draftId, heading, approved, lang, onClose }: { draftId: string; heading: string; approved: boolean; lang: Lang; onClose: () => void }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [doc, setDoc] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Map<number, string>>(new Map());
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadDraftText(draftId).then((r) => {
      if (cancelled) return;
      if (r.ok) setDoc(r);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const changed = [...edits].filter(([i, text]) => doc?.paragraphs[i]?.text !== text);
  const close = () => {
    if (changed.length && !window.confirm(t("Discard your changes?"))) return;
    onClose();
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  async function save() {
    if (!doc || !changed.length) return;
    if (note.trim().length < 3) return setError(t("Say in a few words what you changed."));
    setSaving(true);
    setError(null);
    const r = await saveDraftText({ draftId, baseVersionId: doc.versionId, note, edits: changed.map(([index, text]) => ({ index, text })) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
    onClose();
  }

  const q = query.trim().toLowerCase();
  const shown = (doc?.paragraphs ?? []).filter((p) => p.text.trim() && (!q || (edits.get(p.index) ?? p.text).toLowerCase().includes(q)));

  return (
    <div
      className="pv-root fixed inset-0 z-[100] flex flex-col bg-neutral-950/90 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-2">
        <p className="mr-auto min-w-0 truncate font-semibold">
          ✎ {heading}
          {doc && <span className="ml-2 text-sm font-normal text-white/60">v{doc.version}</span>}
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`🔍 ${t("Find text")}`}
          className="w-48 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/50 focus:bg-white/15 focus:outline-none"
        />
        <button type="button" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-neutral-900" onClick={close} autoFocus>
          ✕ {t("Close")}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-2">
          {!doc && !error && <p className="py-16 text-center text-white/70">{t("Loading")}…</p>}
          {approved && doc && (
            <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-100">{t("This paper is approved. The edited version must be approved again.")}</p>
          )}
          {shown.map((p) => {
            const value = edits.get(p.index) ?? p.text;
            const dirty = value !== p.text;
            return (
              <div key={p.index} className={`flex gap-3 rounded-xl p-2 transition ${dirty ? "bg-violet-500/15 ring-1 ring-violet-400/50" : ""}`}>
                <span className="w-8 shrink-0 pt-2 text-right text-xs tabular-nums text-white/40">{p.index + 1}</span>
                {p.editable ? (
                  <textarea
                    value={value}
                    rows={Math.max(1, Math.ceil(value.length / 90))}
                    onChange={(e) => {
                      const text = e.target.value.replace(/[\r\n]+/g, " ");
                      setEdits((m) => new Map(m).set(p.index, text));
                    }}
                    className="min-w-0 flex-1 resize-y rounded-lg bg-white px-3 py-2 font-serif text-[15px] leading-relaxed text-neutral-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                ) : (
                  <p className="min-w-0 flex-1 px-3 py-2 font-serif text-[15px] text-white/60" title={t("Has tabs, fields or pictures — change it in Word and upload the file.")}>
                    🔒 {p.text}
                  </p>
                )}
                {dirty && (
                  <button
                    type="button"
                    title={t("Undo")}
                    className="shrink-0 self-start rounded-full px-2 py-1 text-sm text-white/70 hover:bg-white/10"
                    onClick={() =>
                      setEdits((m) => {
                        const next = new Map(m);
                        next.delete(p.index);
                        return next;
                      })
                    }
                  >
                    ↺
                  </button>
                )}
              </div>
            );
          })}
          {doc && !shown.length && <p className="py-10 text-center text-white/60">{t("No paragraph matches.")}</p>}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-black/40 px-4 py-3">
        <span className="text-sm text-white/80">
          {changed.length} {t("paragraphs changed")}
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder={t("What did you change? (kept with the version)")}
          className="min-w-56 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:bg-white/15 focus:outline-none"
        />
        <button
          type="button"
          disabled={saving || !changed.length}
          onClick={save}
          className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2 text-sm font-semibold text-white shadow-lg disabled:opacity-40"
        >
          {saving ? `${t("Saving")}…` : t("Save as new version")}
        </button>
        {error && <p className="w-full text-sm text-red-300">{error}</p>}
      </footer>
    </div>
  );
}

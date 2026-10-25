"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { translator, type Lang } from "@/lib/i18n";

const BLOCKED_TAGS = "script, iframe, object, embed, frame, form, input, button, link, meta, base";

/** Keeps only inert markup: no event handlers, no external links, images only from data:/blob:. */
export function sanitise(root: HTMLElement) {
  root.querySelectorAll(BLOCKED_TAGS).forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    for (const { name, value } of [...el.attributes]) {
      const n = name.toLowerCase();
      const v = value.trim().toLowerCase();
      if (n.startsWith("on") || n === "srcdoc" || n === "formaction") el.removeAttribute(name);
      else if ((n === "href" || n === "xlink:href") && !v.startsWith("#")) el.removeAttribute(name);
      else if (n === "src" && !(v.startsWith("data:image/") || v.startsWith("blob:"))) el.removeAttribute(name);
    }
  });
}

/**
 * Shows a stored DOCX as A4 pages in the browser (docx-preview), so drafters and approvers can
 * read a version without downloading it. The file comes from a short-lived signed URL; nothing
 * leaves the browser.
 */
export function DraftPreview({ url, heading, lang }: { url: string; heading: string; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !body.current) return;
    const target = body.current;
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;
        // Render off-document, sanitise, then attach: a drafter can store any DOCX, so its
        // links and sources are untrusted (javascript: hrefs would run under 'unsafe-inline').
        const staging = document.createElement("div");
        const styles = document.createElement("div");
        await renderAsync(blob, staging, styles, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          useBase64URL: true, // data: URLs fit the CSP (img-src/font-src)
          renderComments: false,
          renderAltChunks: false,
        });
        sanitise(staging);
        if (cancelled) return;
        target.replaceChildren(styles, ...staging.childNodes);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setOpen(true)}>
        👁 {t("Preview")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={heading}>
          <div className="nav-glass mx-3 mt-3 flex items-center justify-between gap-3 px-4 py-2.5">
            <p className="truncate font-semibold">{heading}</p>
            <div className="flex shrink-0 gap-2">
              <a className="btn px-3 py-1 text-xs" href={url}>
                ⬇ {t("Download")}
              </a>
              <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setOpen(false)} autoFocus>
                ✕ {t("Close")}
              </button>
            </div>
          </div>
          <div className="draft-preview flex-1 overflow-auto p-3">
            {state === "loading" && <p className="py-10 text-center text-sm text-white/80">{t("Loading")}…</p>}
            {state === "error" && (
              <p className="py-10 text-center text-sm text-white/90">{t("Preview unavailable — download the DOCX instead.")}</p>
            )}
            <div ref={body} />
          </div>
        </div>
      )}
    </>
  );
}

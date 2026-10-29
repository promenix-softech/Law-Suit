"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { translator, type Lang } from "@/lib/i18n";
import {
  chooseAcross,
  fitScale,
  fitWidthScale,
  pageLabel,
  spreadPages,
  spreadStart,
  stepTarget,
  zoomIn,
  zoomOut,
  type Across,
  type Size,
} from "@/lib/preview/book";
import { numberPages, paginateSection } from "@/lib/preview/paginate";

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

type Page = { node: HTMLElement; w: number; h: number };
type View = "book" | "scroll";
type Flip = { dir: 1 | -1; from: number; to: number };

const FLIP_MS = 720;

/**
 * Opens a stored DOCX in a full-screen reader so drafters and approvers can read a version without
 * downloading it. The viewer is portalled to <body>: inside a draft card it would be clipped by the
 * card's glass effect (backdrop-filter makes the card the containing block of fixed elements).
 */
export function DraftPreview({ url, heading, lang }: { url: string; heading: string; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);

  return (
    <>
      <button ref={opener} type="button" className="btn px-3 py-1 text-xs" onClick={() => setOpen(true)}>
        👁 {t("Preview")}
      </button>
      {open && createPortal(<Viewer url={url} heading={heading} lang={lang} onClose={close} />, document.body)}
    </>
  );
}

/**
 * Book view: two pages side by side on wide screens (one on phones) that turn with a 3D page-flip;
 * scroll view: every page in a column. Zoom, full screen, page slider, keyboard (← → Home End + − 0
 * Esc) and swipe. The file comes from a short-lived signed URL and is rendered in the browser
 * (docx-preview); nothing leaves the browser.
 */
function Viewer({ url, heading, lang, onClose }: { url: string; heading: string; lang: Lang; onClose: () => void }) {
  const t = useMemo(() => translator(lang), [lang]);
  const root = useRef<HTMLDivElement>(null);
  const stylesHost = useRef<HTMLDivElement>(null);
  const measureHost = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scrollList = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pages, setPages] = useState<Page[]>([]);
  const [view, setView] = useState<View>("book");
  const [current, setCurrent] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState<Size>({ w: 0, h: 0 });
  const [flip, setFlip] = useState<Flip | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  // Load: render off-document, sanitise (a drafter can store any DOCX, so its links and sources
  // are untrusted), then measure each page once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;
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
        if (cancelled || !stylesHost.current || !measureHost.current) return;
        stylesHost.current.replaceChildren(styles);
        measureHost.current.replaceChildren(staging);
        // Split long sections into A4 pages, then measure every page at its own size.
        const host = measureHost.current;
        const split = [...staging.querySelectorAll<HTMLElement>("section.docx")].flatMap(paginateSection);
        numberPages(split);
        host.replaceChildren(...split);
        const measured = split.map((node) => ({ node, w: node.offsetWidth, h: node.offsetHeight }));
        host.replaceChildren();
        if (!measured.length) throw new Error("no pages");
        setPages(measured);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onFs = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const total = pages.length;
  const base: Size = useMemo(
    () => ({ w: Math.max(1, ...pages.map((p) => p.w)), h: Math.max(1, ...pages.map((p) => p.h)) }),
    [pages],
  );
  const across: Across = view === "book" ? chooseAcross(box, base, total) : 1;
  const shown = spreadStart(current, across);
  const bookScale = fitScale(box, base, across) * zoom;
  const scrollScale = fitWidthScale(box, base) * zoom;

  const scrollToPage = useCallback((i: number) => {
    const el = scrollList.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }, [reduced]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (!total) return;
      if (view === "scroll") {
        const next = Math.min(total - 1, Math.max(0, current + dir));
        setCurrent(next);
        scrollToPage(next);
        return;
      }
      if (flip) return;
      const to = stepTarget(shown, dir, across, total);
      if (to === null) return;
      if (reduced) setCurrent(to);
      else setFlip({ dir, from: shown, to });
    },
    [across, current, flip, reduced, scrollToPage, shown, total, view],
  );

  const onFlipped = useCallback((to: number) => {
    setCurrent(to);
    setFlip(null);
  }, []);

  const jump = useCallback(
    (i: number) => {
      if (!total || flip) return;
      const page = Math.min(total - 1, Math.max(0, i));
      setCurrent(page);
      if (view === "scroll") scrollToPage(page);
    },
    [flip, scrollToPage, total, view],
  );

  // Switching to the scroll view keeps the page the reader was on.
  useLayoutEffect(() => {
    if (view !== "scroll" || state !== "ready") return;
    const el = scrollList.current?.children[current] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the view or document changes
  }, [view, state]);

  const onScroll = useCallback(() => {
    const list = scrollList.current;
    const area = stage.current;
    if (view !== "scroll" || !list || !area) return;
    const mid = area.scrollTop + area.clientHeight / 3;
    let i = 0;
    for (const [k, child] of [...list.children].entries()) if ((child as HTMLElement).offsetTop <= mid) i = k;
    setCurrent(i);
  }, [view]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void root.current?.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") return trapFocus(e, root.current);
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const act: Record<string, () => void> = {
        Escape: onClose,
        ArrowRight: () => go(1),
        ArrowLeft: () => go(-1),
        Home: () => jump(0),
        End: () => jump(total - 1),
        "+": () => setZoom(zoomIn),
        "=": () => setZoom(zoomIn),
        "-": () => setZoom(zoomOut),
        "0": () => setZoom(1),
      };
      // In the book view the page keys turn pages; in the scroll view they scroll as usual.
      if (view === "book") Object.assign(act, { PageDown: () => go(1), PageUp: () => go(-1), " ": () => go(1) });
      const fn = act[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, jump, onClose, total, view]);

  // Swipe to turn pages (touch and pen; a mouse selects text instead).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    swipe.current = e.pointerType !== "mouse" && view === "book" && zoom <= 1 ? { x: e.clientX, y: e.clientY } : null;
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  };

  const label = total ? pageLabel(view === "book" ? shown : current, across, total) : null;
  const atStart = view === "book" ? stepTarget(shown, -1, across, total) === null : current <= 0;
  const atEnd = view === "book" ? stepTarget(shown, 1, across, total) === null : current >= total - 1;

  return (
    <div
      ref={root}
      className="pv-root fixed inset-0 z-[100] flex flex-col bg-neutral-950/90 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div ref={stylesHost} className="contents" />
      <div ref={measureHost} aria-hidden className="pointer-events-none invisible absolute -left-[100000px] top-0" />

      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/30 px-3 py-2 sm:px-4">
        <p className="mr-auto min-w-0 truncate font-semibold" title={heading}>
          {heading}
        </p>
        <div className="flex rounded-full bg-white/10 p-0.5 text-sm" role="group" aria-label={t("Book") + " / " + t("Scroll")}>
          {(["book", "scroll"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                setFlip(null);
                setView(v);
              }}
              className={`rounded-full px-3 py-1 transition ${view === v ? "bg-white text-neutral-900 shadow" : "text-white/80 hover:text-white"}`}
            >
              {v === "book" ? `📖 ${t("Book")}` : `☰ ${t("Scroll")}`}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-full bg-white/10 p-0.5 text-sm">
          <IconButton label={t("Zoom out")} onClick={() => setZoom(zoomOut)}>
            −
          </IconButton>
          <button type="button" className="min-w-14 rounded-full px-2 py-1 tabular-nums hover:bg-white/10" title={t("Fit to screen")} onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label={t("Zoom in")} onClick={() => setZoom(zoomIn)}>
            +
          </IconButton>
        </div>
        {document.fullscreenEnabled && (
          <IconButton label={fullscreen ? t("Exit full screen") : t("Full screen")} onClick={toggleFullscreen}>
            {fullscreen ? "🗗" : "⛶"}
          </IconButton>
        )}
        <a className="rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20" href={url}>
          ⬇ {t("Download")}
        </a>
        <button type="button" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white/90" onClick={onClose} autoFocus>
          ✕ {t("Close")}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={stage}
          className="pv-stage absolute inset-0 p-4 sm:p-8"
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          {state === "loading" && (
            <div className="m-auto flex flex-col items-center gap-4" role="status">
              <div className="pv-skeleton h-[60vh] max-h-[640px] w-[42vh] max-w-[80vw] rounded" />
              <p className="text-sm text-white/80">{t("Preparing pages")}…</p>
            </div>
          )}
          {state === "error" && (
            <div className="m-auto max-w-md text-center">
              <p className="text-sm text-white/90">{t("Preview unavailable — download the DOCX instead.")}</p>
              <a className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-900" href={url}>
                ⬇ {t("Download")}
              </a>
            </div>
          )}
          {state === "ready" && view === "book" && (
            <Book pages={pages} base={base} across={across} start={shown} scale={bookScale} flip={flip} onFlipped={onFlipped} />
          )}
          {state === "ready" && view === "scroll" && (
            <div ref={scrollList} className="mx-auto flex flex-col items-center gap-6 pb-8">
              {pages.map((p, i) => (
                <PageView key={i} page={p} scale={scrollScale} className="pv-page-single" />
              ))}
            </div>
          )}
        </div>
        {state === "ready" && (
          <>
            <button type="button" className="pv-edge left-2 sm:left-4" aria-label={t("Previous page")} disabled={atStart} onClick={() => go(-1)}>
              ‹
            </button>
            <button type="button" className="pv-edge right-2 sm:right-4" aria-label={t("Next page")} disabled={atEnd} onClick={() => go(1)}>
              ›
            </button>
          </>
        )}
      </div>

      {state === "ready" && label && (
        <footer className="flex items-center gap-3 border-t border-white/10 bg-black/30 px-4 py-2 text-sm">
          <span className="shrink-0 tabular-nums text-white/85" aria-live="polite">
            {t("Page")} {label.from}
            {label.to !== label.from && `–${label.to}`} / {label.total}
          </span>
          {total > 1 && (
            <input
              type="range"
              className="pv-slider flex-1"
              min={1}
              max={total}
              value={(view === "book" ? shown : current) + 1}
              aria-label={t("Page")}
              onChange={(e) => jump(Number(e.target.value) - 1)}
            />
          )}
        </footer>
      )}
    </div>
  );
}

function Book(props: {
  pages: Page[];
  base: Size;
  across: Across;
  start: number;
  scale: number;
  flip: Flip | null;
  onFlipped: (to: number) => void;
}) {
  const { pages, base, across, start, scale, flip } = props;
  const total = pages.length;
  const halfW = base.w * scale;
  const h = base.h * scale;

  // What lies underneath while a leaf turns: the pages that are revealed, not the ones moving.
  let left: number | null;
  let right: number | null;
  if (!flip) [left, right] = spreadPages(start, across, total);
  else if (across === 2) [left, right] = flip.dir === 1 ? [flip.from, at(flip.to + 1, total)] : [flip.to, at(flip.from + 1, total)];
  else [left, right] = [flip.dir === 1 ? flip.to : flip.from, null];

  return (
    <div className={`pv-book ${across === 2 ? "two" : "one"}`} style={{ width: halfW * across, height: h }}>
      <div className="pv-half left" style={{ width: halfW }}>
        <PageView page={left === null ? undefined : pages[left]} scale={scale} />
      </div>
      {across === 2 && (
        <div className="pv-half right" style={{ width: halfW }}>
          <PageView page={right === null ? undefined : pages[right]} scale={scale} />
        </div>
      )}
      {across === 2 && <div className="pv-spine" aria-hidden />}
      {flip && <Leaf key={`${flip.from}>${flip.to}`} {...props} flip={flip} halfW={halfW} h={h} />}
    </div>
  );
}

const at = (i: number, total: number) => (i < total ? i : null);

/** The turning page: front shows the page lifting off, back the page it uncovers on the other side. */
function Leaf({
  pages,
  across,
  scale,
  flip,
  halfW,
  h,
  onFlipped,
}: {
  pages: Page[];
  across: Across;
  scale: number;
  flip: Flip;
  halfW: number;
  h: number;
  onFlipped: (to: number) => void;
}) {
  const leaf = useRef<HTMLDivElement>(null);
  const frontShade = useRef<HTMLDivElement>(null);
  const backShade = useRef<HTMLDivElement>(null);

  const forward = flip.dir === 1;
  // Two-up: forward turns the right page over to the left; backward the left page to the right.
  // One-up: the page lifts away to the left (forward) or comes back from the left (backward).
  let front: number;
  let back: number | null;
  let from: number;
  let to: number;
  let origin: "left" | "right";
  let x: number;
  if (across === 2) {
    front = forward ? flip.from + 1 : flip.from;
    back = forward ? flip.to : flip.to + 1;
    [from, to] = forward ? [0, -180] : [0, 180];
    origin = forward ? "left" : "right";
    x = forward ? halfW : 0;
  } else {
    front = forward ? flip.from : flip.to;
    back = null;
    [from, to] = forward ? [0, -180] : [-180, 0];
    origin = "left";
    x = 0;
  }

  useLayoutEffect(() => {
    const el = leaf.current;
    if (!el) return;
    const timing: KeyframeAnimationOptions = { duration: FLIP_MS, easing: "cubic-bezier(0.45, 0.05, 0.25, 1)", fill: "forwards" };
    const turn = el.animate([{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }], timing);
    const lift = across === 2 || forward ? [0, 0.45, 0.45] : [0.45, 0.45, 0];
    frontShade.current?.animate(lift.map((o, i) => ({ opacity: o, offset: i / 2 })), timing);
    backShade.current?.animate([{ opacity: 0.45 }, { opacity: 0.45, offset: 0.5 }, { opacity: 0 }], timing);
    turn.onfinish = () => onFlipped(flip.to);
    return () => turn.cancel();
  }, [across, flip.to, forward, from, to, onFlipped]);

  return (
    <div className="pv-leaf" ref={leaf} style={{ left: x, width: halfW, height: h, transformOrigin: `${origin} center` }}>
      <div className={`pv-face front ${origin === "left" ? "justify-start" : "justify-end"}`}>
        <PageView page={pages[front]} scale={scale} />
        <div ref={frontShade} className="pv-shade" />
      </div>
      {back !== null && (
        <div className={`pv-face back ${origin === "left" ? "justify-end" : "justify-start"}`}>
          <PageView page={pages[back]} scale={scale} />
          <div ref={backShade} className="pv-shade" />
        </div>
      )}
    </div>
  );
}

/** One page: a clone of the rendered section, laid out at its own size and scaled to fit. */
function PageView({ page, scale, className = "" }: { page?: Page; scale: number; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (host.current && page) host.current.replaceChildren(page.node.cloneNode(true));
  }, [page]);
  if (!page) return null;
  return (
    <div className={`pv-page ${className}`} style={{ width: page.w * scale, height: page.h * scale }}>
      <div ref={host} style={{ width: page.w, height: page.h, transform: `scale(${scale})`, transformOrigin: "0 0" }} />
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-full text-base hover:bg-white/15">
      {children}
    </button>
  );
}

/** Keeps Tab inside the dialog. */
function trapFocus(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input")].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  } else if (!root.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  }
}

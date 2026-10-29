"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setLanguage } from "@/app/lang-actions";
import { translator, type Lang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { caseStatus } from "@/lib/ui";

type CaseHit = { id: string; no: string; borrower: string; status: string };
type Item = { key: string; label: string; hint?: string; group: "action" | "case"; run: () => void };

/**
 * Ctrl/⌘ K (or "/") opens a search over the cases the user can see and the main actions.
 * Cases are read with the browser client, so RLS decides what appears — same as the dashboard.
 */
export function CommandPalette({ lang, roles }: { lang: Lang; roles: string[] }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [cases, setCases] = useState<CaseHit[] | null>(null);
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    if (cases) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from("cases")
        .select("id, case_no_internal, status, parties(name, position)")
        .is("archived_at", null)
        .order("case_no_internal")
        .limit(1000);
      if (cancelled) return;
      setCases(
        (data ?? []).map((c) => ({
          id: c.id,
          no: c.case_no_internal,
          status: c.status,
          borrower: [...(c.parties ?? [])].sort((a, b) => a.position - b.position)[0]?.name ?? "",
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cases]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      close();
      router.push(href);
    };
    const isAdmin = roles.includes("admin");
    const actions: Item[] = [
      { key: "a:home", label: t("Dashboard"), group: "action", run: go("/dashboard") },
      { key: "a:tasks", label: t("My tasks"), group: "action", run: go("/dashboard/tasks") },
      ...(isAdmin
        ? [
            { key: "a:new", label: t("New case"), group: "action" as const, run: go("/dashboard/cases/new") },
            { key: "a:batches", label: t("Bulk upload"), group: "action" as const, run: go("/dashboard/batches") },
            { key: "a:audit", label: t("Audit log"), group: "action" as const, run: go("/dashboard/audit") },
            { key: "a:billing", label: t("Billing"), group: "action" as const, run: go("/dashboard/billing") },
            { key: "a:settings", label: t("Office settings"), group: "action" as const, run: go("/dashboard/settings") },
          ]
        : []),
      {
        key: "a:lang",
        label: lang === "mr" ? t("Switch to English") : t("Switch to Marathi"),
        group: "action",
        run: () => {
          close();
          startTransition(async () => {
            await setLanguage(lang === "mr" ? "en" : "mr");
            router.refresh();
          });
        },
      },
    ];
    const caseItems: Item[] = (cases ?? []).map((c) => ({
      key: `c:${c.id}`,
      label: c.no,
      hint: [c.borrower, caseStatus(c.status, t)[0]].filter(Boolean).join(" · "),
      group: "case",
      run: go(`/dashboard/cases/${c.id}`),
    }));

    const q = query.trim().toLowerCase();
    if (!q) return [...actions, ...caseItems.slice(0, 8)];
    const words = q.split(/\s+/);
    const hit = (i: Item) => words.every((w) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(w));
    return [...caseItems.filter(hit).slice(0, 30), ...actions.filter(hit)];
  }, [cases, query, roles, lang, t, close, router]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn hidden items-center gap-2 px-3 py-1.5 text-xs md:inline-flex"
        aria-label={t("Search")}
      >
        <span aria-hidden>⌕</span> {t("Search")}
        <kbd className="muted rounded border border-current/20 px-1 text-[10px]">Ctrl K</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="btn px-2.5 py-1.5 text-xs md:hidden" aria-label={t("Search")}>
        ⌕
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Search")}
            className="glass fade-up w-full max-w-xl overflow-hidden rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={t("Type a case no., borrower or action…")}
              className="w-full border-b border-current/10 bg-transparent px-5 py-4 text-base outline-none"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={items[active] ? `palette-${items[active].key}` : undefined}
            />
            <ul ref={list} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {items.map((it, i) => (
                <li
                  key={it.key}
                  id={`palette-${it.key}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={it.run}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${
                    i === active ? "bg-indigo-500/15" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden className="muted w-4 text-center">
                      {it.group === "case" ? "§" : "→"}
                    </span>
                    <span className="truncate font-medium">{it.label}</span>
                  </span>
                  {it.hint && <span className="muted truncate text-xs">{it.hint}</span>}
                </li>
              ))}
              {cases === null && <li className="muted px-3 py-2.5 text-sm">{t("Loading")}…</li>}
              {cases !== null && !items.length && <li className="muted px-3 py-2.5 text-sm">{t("No matches.")}</li>}
            </ul>
            <p className="muted flex gap-4 border-t border-current/10 px-5 py-2 text-[11px]">
              <span>↵ {t("to open")}</span>
              <span>↑↓ {t("to move")}</span>
              <span>Esc {t("to close")}</span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}

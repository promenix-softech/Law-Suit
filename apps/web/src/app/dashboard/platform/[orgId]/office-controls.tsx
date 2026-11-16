"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SCHEME_PRESETS, type SchemeTerms } from "@civil-suits/domain";
import { translator, type Lang } from "@/lib/i18n";
import { inviteOfficeAdmin, saveScheme, setSuspended, type PlatformResult } from "../actions";

/** Invites an admin into this office (its first one, or another if the first never signed in). */
export function InviteAdminControl({ orgId, lang }: { orgId: string; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PlatformResult | null>(null);
  const [f, setF] = useState({ fullName: "", email: "" });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await inviteOfficeAdmin({ orgId, ...f });
          setResult(r);
          if (r.ok) setF({ fullName: "", email: "" });
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t("Admin's full name")}</span>
          <input className="input-glass mt-1" required minLength={2} maxLength={120} value={f.fullName} onChange={(e) => setF((p) => ({ ...p, fullName: e.target.value }))} />
        </label>
        <label className="block">
          <span className="label">{t("Admin's email")}</span>
          <input className="input-glass mt-1" type="email" required value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary px-4 py-2" disabled={pending}>
          ✉ {pending ? t("Sending…") : t("Invite admin")}
        </button>
        <Result r={result} t={t} />
      </div>
    </form>
  );
}

function Result({ r, t }: { r: PlatformResult | null; t: (s: string) => string }) {
  if (!r) return null;
  return <p className={`text-sm ${r.ok ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{t(r.ok ? r.message : r.error)}</p>;
}

/** The office's scheme: start from a ready-made one, then change any number. */
export function SchemeForm({ orgId, terms, note, today, lang }: { orgId: string; terms: SchemeTerms | null; note: string | null; today: string; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PlatformResult | null>(null);
  const num = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [f, setF] = useState({
    schemeName: terms?.schemeName ?? "",
    period: terms?.period ?? ("monthly" as "monthly" | "yearly"),
    casesPerMonth: num(terms?.casesPerMonth),
    casesPerYear: num(terms?.casesPerYear),
    validFrom: terms?.validFrom ?? today,
    validUntil: terms?.validUntil ?? "",
    onLimit: terms?.onLimit ?? ("warn" as "warn" | "block"),
    aiJobsPerDay: num(terms?.aiJobsPerDay),
    seats: num(terms?.seats),
    note: note ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((old) => ({ ...old, [k]: v }));

  const applyPreset = (key: string) => {
    const p = SCHEME_PRESETS.find((x) => x.key === key);
    if (!p) return;
    setF((old) => ({ ...old, schemeName: p.schemeName, period: p.period, casesPerMonth: num(p.casesPerMonth), casesPerYear: num(p.casesPerYear) }));
  };

  const save = () =>
    start(async () => {
      const r = await saveScheme({ orgId, ...f });
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      <label className="block max-w-sm">
        <span className="label">{t("Start from a ready-made scheme")}</span>
        <select className="input-glass mt-1" defaultValue="" onChange={(e) => applyPreset(e.target.value)} aria-label={t("Start from a ready-made scheme")}>
          <option value="" disabled>
            {t("Choose…")}
          </option>
          {SCHEME_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.schemeName}
              {p.casesPerMonth != null ? ` — ${p.casesPerMonth} / ${t("month")}` : ""}
              {p.casesPerYear != null ? ` — ${p.casesPerYear} / ${t("year")}` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t("Scheme name")}</span>
          <input className="input-glass mt-1" value={f.schemeName} maxLength={60} onChange={(e) => set("schemeName", e.target.value)} />
        </label>
        <fieldset>
          <legend className="label">{t("Paid")}</legend>
          <div className="mt-2 flex gap-4 text-sm">
            {(["monthly", "yearly"] as const).map((p) => (
              <label key={p} className="flex items-center gap-2">
                <input type="radio" name="period" checked={f.period === p} onChange={() => set("period", p)} />
                {p === "monthly" ? t("Month by month") : t("A year in advance")}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="label">{t("New cases allowed per month")}</span>
          <input className="input-glass mt-1" inputMode="numeric" value={f.casesPerMonth} placeholder={t("no limit")} onChange={(e) => set("casesPerMonth", e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="block">
          <span className="label">{t("New cases allowed per scheme year")}</span>
          <input className="input-glass mt-1" inputMode="numeric" value={f.casesPerYear} placeholder={t("no limit")} onChange={(e) => set("casesPerYear", e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="block">
          <span className="label">{t("Valid from")}</span>
          <input type="date" className="input-glass mt-1" value={f.validFrom} onChange={(e) => set("validFrom", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t("Valid until (empty = no end date)")}</span>
          <input type="date" className="input-glass mt-1" value={f.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
        </label>
      </div>

      <fieldset className="rounded-2xl border border-current/10 p-4">
        <legend className="label px-1">{t("At the limit, or after the last valid day")}</legend>
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="onLimit" className="mt-1" checked={f.onLimit === "warn"} onChange={() => set("onLimit", "warn")} />
            <span>
              <span className="font-medium">{t("Only warn")}</span>
              <span className="muted block text-xs">{t("The office keeps working; you and its admin see the warning.")}</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="onLimit" className="mt-1" checked={f.onLimit === "block"} onChange={() => set("onLimit", "block")} />
            <span>
              <span className="font-medium">{t("Refuse new cases")}</span>
              <span className="muted block text-xs">{t("Existing cases can still be worked on; no new case can be opened.")}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t("AI readings per day")}</span>
          <input className="input-glass mt-1" inputMode="numeric" value={f.aiJobsPerDay} placeholder={t("platform default")} onChange={(e) => set("aiJobsPerDay", e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="block">
          <span className="label">{t("People allowed (seats)")}</span>
          <input className="input-glass mt-1" inputMode="numeric" value={f.seats} placeholder={t("no limit")} onChange={(e) => set("seats", e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>
      <label className="block">
        <span className="label">{t("Note (only you see this)")}</span>
        <textarea className="input-glass mt-1" rows={2} maxLength={500} value={f.note} onChange={(e) => set("note", e.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary px-5 py-2" disabled={pending || f.schemeName.trim().length < 2 || !f.validFrom} onClick={save}>
          {pending ? t("Saving…") : t("Save scheme")}
        </button>
        <Result r={result} t={t} />
      </div>
    </div>
  );
}

/** Pause an office (its people then see and change nothing), or let it work again. */
export function SuspendControl({ orgId, suspendedAt, reason, isPlatform, lang }: { orgId: string; suspendedAt: string | null; reason: string | null; isPlatform: boolean; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [why, setWhy] = useState("");
  const [result, setResult] = useState<PlatformResult | null>(null);

  const go = (suspended: boolean) =>
    start(async () => {
      const r = await setSuspended({ orgId, suspended, reason: suspended ? why : undefined });
      setResult(r);
      if (r.ok) {
        setWhy("");
        router.refresh();
      }
    });

  if (isPlatform) return <p className="muted text-sm">{t("This is your own office; it cannot be paused.")}</p>;
  if (suspendedAt) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm">
          ⏸ {t("Paused")}: “{reason}”
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary px-4 py-2" disabled={pending} onClick={() => go(false)}>
            ▶ {pending ? t("Saving…") : t("Resume this office")}
          </button>
          <Result r={result} t={t} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="muted text-sm">{t("While paused, the office's people can sign in but see and change nothing. Nothing is deleted.")}</p>
      <label className="block">
        <span className="label">{t("Reason (the office's people will see this)")}</span>
        <textarea className="input-glass mt-1" rows={2} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn px-4 py-2"
          disabled={pending || !why.trim()}
          onClick={() => {
            if (window.confirm(t("Pause this office now? Its people will not be able to work until you resume it."))) go(true);
          }}
        >
          ⏸ {pending ? t("Saving…") : t("Pause this office")}
        </button>
        <Result r={result} t={t} />
      </div>
    </div>
  );
}

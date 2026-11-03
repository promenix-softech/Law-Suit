"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { translator, type Lang } from "@/lib/i18n";
import type { ActionResult } from "./actions";
import { advanceFiling, recordFiling, recordRegistration } from "./filing-actions";

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const ORDER = ["approved", "notary_stamp", "efiling_ready", "filed", "listed", "disposed"];

export type FilingView = {
  caseId: string;
  status: string;
  canEdit: boolean;
  bundleBuilt: boolean;
  /** Court fee computed in code, for the form's default. */
  courtFeePaise: number | null;
  filing: { efilingNo: string | null; filedOn: string | null; courtFeePaise: number | null; txnId: string | null } | null;
  cnr: string | null;
  filingNo: string | null;
};

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="fade-up text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
  ) : (
    <p className="fade-up text-sm text-red-600 dark:text-red-400">{result.error}</p>
  );
}

/**
 * After approval: notary / stamp → ready for e-filing → filed (e-filing no., date, court fee) →
 * CNR and filing number. Each step shows as done, current (with its form) or still to come.
 */
export function FilingPanel({ v, lang }: { v: FilingView; lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const at = ORDER.indexOf(v.status);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    });

  const [efilingNo, setEfilingNo] = useState("");
  const [filedOn, setFiledOn] = useState(todayIST());
  const [fee, setFee] = useState(v.courtFeePaise != null ? String(v.courtFeePaise / 100) : "");
  const [txnId, setTxnId] = useState("");
  const [cnr, setCnr] = useState(v.cnr ?? "");
  const [filingNo, setFilingNo] = useState(v.filingNo ?? "");

  const steps = [
    {
      key: "notary_stamp",
      title: t("Notary / stamp done"),
      detail: t("Affidavit sworn, vakalatnama stamped, bank officer's signatures"),
      action: (
        <button className="btn btn-primary px-4 py-2 text-sm" disabled={pending} onClick={() => run(() => advanceFiling({ caseId: v.caseId, to: "notary_stamp" }))}>
          ✓ {t("Mark notary / stamp done")}
        </button>
      ),
      note: t("After this the plaint is locked."),
    },
    {
      key: "efiling_ready",
      title: t("Ready for e-filing"),
      detail: v.bundleBuilt ? t("E-filing bundle is built.") : t("Build the e-filing bundle first (below)."),
      action: (
        <button
          className="btn btn-primary px-4 py-2 text-sm"
          disabled={pending || !v.bundleBuilt}
          onClick={() => run(() => advanceFiling({ caseId: v.caseId, to: "efiling_ready" }))}
        >
          ✓ {t("Mark ready for e-filing")}
        </button>
      ),
    },
    {
      key: "filed",
      title: t("Filed on eCourts"),
      detail: v.filing
        ? `${t("E-filing no.")} ${v.filing.efilingNo ?? "—"} · ${v.filing.filedOn ?? ""}${v.filing.courtFeePaise != null ? ` · ${t("Court fee")} ₹${(v.filing.courtFeePaise / 100).toLocaleString("en-IN")}` : ""}${v.filing.txnId ? ` · ${v.filing.txnId}` : ""}`
        : t("E-filing acknowledgement number, date and court-fee payment"),
      action: (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="label">{t("E-filing no.")} *</span>
            <input value={efilingNo} onChange={(e) => setEfilingNo(e.target.value)} maxLength={60} className="input-glass mt-1" />
          </label>
          <label className="block text-sm">
            <span className="label">{t("Filed on")} *</span>
            <input type="date" value={filedOn} max={todayIST()} onChange={(e) => setFiledOn(e.target.value)} className="input-glass mt-1" />
          </label>
          <label className="block text-sm">
            <span className="label">{t("Court fee paid (₹)")}</span>
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="input-glass mt-1" />
          </label>
          <label className="block text-sm">
            <span className="label">{t("Payment / GRN / transaction ID")}</span>
            <input value={txnId} onChange={(e) => setTxnId(e.target.value)} maxLength={80} className="input-glass mt-1" />
          </label>
          <div className="sm:col-span-2">
            <button
              className="btn btn-primary px-4 py-2 text-sm"
              disabled={pending || !efilingNo.trim()}
              onClick={() => run(() => recordFiling({ caseId: v.caseId, efilingNo, filedOn, courtFeeRupees: fee, txnId: txnId || undefined }))}
            >
              {pending ? `${t("Saving")}…` : `✓ ${t("Record filing")}`}
            </button>
          </div>
        </div>
      ),
    },
    {
      key: "registered",
      title: t("CNR and filing number"),
      detail: v.cnr ? `CNR ${v.cnr}${v.filingNo ? ` · ${t("Filing no.")} ${v.filingNo}` : ""}` : t("Given by the court after scrutiny — 16 characters, e.g. MHPU010012342026"),
      action: (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="label">CNR *</span>
            <input
              value={cnr}
              onChange={(e) => setCnr(e.target.value.toUpperCase())}
              maxLength={20}
              placeholder="MHPU010012342026"
              className="input-glass mt-1 font-mono tracking-wider"
            />
          </label>
          <label className="block text-sm">
            <span className="label">{t("Filing / registration no.")}</span>
            <input value={filingNo} onChange={(e) => setFilingNo(e.target.value)} maxLength={60} placeholder="SCS/1234/2026" className="input-glass mt-1" />
          </label>
          <div className="sm:col-span-2">
            <button
              className="btn btn-primary px-4 py-2 text-sm"
              disabled={pending || !cnr.trim()}
              onClick={() => run(() => recordRegistration({ caseId: v.caseId, cnr, filingNo: filingNo || undefined }))}
            >
              {pending ? `${t("Saving")}…` : `✓ ${v.cnr ? t("Update CNR") : t("Save CNR")}`}
            </button>
          </div>
        </div>
      ),
    },
  ];

  // Which step is current: the first not yet done (registration is "done" once a CNR exists).
  const done = (key: string) => (key === "registered" ? !!v.cnr : at >= ORDER.indexOf(key));
  const current = steps.find((s) => !done(s.key))?.key ?? null;

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {steps.map((s, i) => {
          const isDone = done(s.key);
          const isCurrent = s.key === current;
          return (
            <li key={s.key} className={`flex gap-3 rounded-2xl p-3 ${isCurrent ? "bg-violet-500/10 ring-1 ring-violet-400/40" : ""}`}>
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  isDone ? "bg-emerald-500 text-white" : isCurrent ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white" : "border border-current/20 text-current/50"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${!isDone && !isCurrent ? "muted" : ""}`}>{s.title}</p>
                <p className="muted text-sm">{s.detail}</p>
                {isCurrent && v.canEdit && <div className="mt-3">{s.action}</div>}
                {isCurrent && s.note && <p className="muted mt-2 text-xs">{s.note}</p>}
                {/* The CNR can be corrected later; the other steps are done once. */}
                {isDone && s.key === "registered" && v.canEdit && (
                  <details className="mt-2">
                    <summary className="muted cursor-pointer text-xs">{t("Correct the CNR / filing no.")}</summary>
                    <div className="mt-2">{s.action}</div>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <Status result={result} />
    </div>
  );
}

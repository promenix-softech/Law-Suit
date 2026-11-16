"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatINR } from "@civil-suits/domain";
import { translator, type Lang } from "@/lib/i18n";
import type { PlatformResult } from "./actions";
import { issueInvoice, previewInvoice, saveBillingPlan, setInvoiceStatus, type DraftResult } from "./billing-actions";

function Msg({ r, t }: { r: PlatformResult | { ok: false; error: string } | null; t: (s: string) => string }) {
  if (!r) return null;
  return <p className={`text-sm ${r.ok ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{t(r.ok ? r.message : r.error)}</p>;
}

const rupeesText = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export type PlanView = {
  effectiveFrom: string;
  slabs: { upTo: number | null; ratePaise: number }[];
  minimumPaise: number;
  recipientGstin: string | null;
  recipientState: string;
  sacCode: string | null;
};

/** Prices of the office: per suit pack by slab, a monthly minimum, and GST details. */
export function BillingPlanForm({ orgId, plan, today, lang }: { orgId: string; plan: PlanView | null; today: string; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PlatformResult | null>(null);
  const [slabs, setSlabs] = useState(
    plan?.slabs.map((s) => ({ upTo: s.upTo == null ? "" : String(s.upTo), rate: rupeesText(s.ratePaise) })) ?? [{ upTo: "", rate: "" }],
  );
  const [f, setF] = useState({
    effectiveFrom: plan?.effectiveFrom ?? `${today.slice(0, 7)}-01`,
    minimum: plan ? rupeesText(plan.minimumPaise) : "",
    gstin: plan?.recipientGstin ?? "",
    state: plan?.recipientState ?? "27",
    sac: plan?.sacCode ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const setSlab = (i: number, k: "upTo" | "rate", v: string) => setSlabs((p) => p.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBillingPlan({ orgId, ...f, slabs });
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <div>
        <p className="label">{t("Price per suit pack")}</p>
        <div className="mt-2 space-y-2">
          {slabs.map((s, i) => {
            const last = i === slabs.length - 1;
            const from = i === 0 ? 1 : Number(slabs[i - 1]!.upTo || 0) + 1;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="muted w-28">
                  {from}
                  {last ? ` ${t("and above")}` : " –"}
                </span>
                {!last && (
                  <input className="input-glass w-24" inputMode="numeric" aria-label={t("Up to (suit packs)")} placeholder={t("up to")} value={s.upTo} onChange={(e) => setSlab(i, "upTo", e.target.value.replace(/\D/g, ""))} />
                )}
                <span className="muted">₹</span>
                <input className="input-glass w-32" inputMode="decimal" aria-label={t("Price per suit pack (₹)")} value={s.rate} onChange={(e) => setSlab(i, "rate", e.target.value)} />
                {slabs.length > 1 && (
                  <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setSlabs((p) => p.filter((_, j) => j !== i))}>
                    {t("Remove")}
                  </button>
                )}
              </div>
            );
          })}
          {slabs.length < 10 && (
            <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setSlabs((p) => [...p.slice(0, -1), { ...p.at(-1)!, upTo: "" }, { upTo: "", rate: p.at(-1)!.rate }])}>
              ＋ {t("Add a slab")}
            </button>
          )}
        </div>
        <p className="muted mt-1 text-xs">{t("For a fixed fee only, set the price to 0 and the fee as the monthly minimum.")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="label">{t("Monthly minimum (₹)")}</span>
          <input className="input-glass mt-1" inputMode="decimal" value={f.minimum} placeholder="0" onChange={(e) => set("minimum", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t("Prices apply from")}</span>
          <input className="input-glass mt-1" type="date" required value={f.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t("Office's GSTIN")}</span>
          <input className="input-glass mt-1 uppercase" maxLength={15} value={f.gstin} placeholder={t("if registered")} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
        </label>
        <label className="block">
          <span className="label">{t("State code (place of supply)")}</span>
          <input className="input-glass mt-1" inputMode="numeric" maxLength={2} required value={f.state} onChange={(e) => set("state", e.target.value.replace(/\D/g, ""))} />
          <span className="muted mt-1 block text-xs">{t("27 = Maharashtra: CGST + SGST. Another state: IGST.")}</span>
        </label>
        <label className="block">
          <span className="label">{t("SAC code")}</span>
          <input className="input-glass mt-1" inputMode="numeric" maxLength={8} value={f.sac} onChange={(e) => set("sac", e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary px-4 py-2" disabled={pending}>
          {pending ? t("Saving…") : t("Save prices")}
        </button>
        <Msg r={result} t={t} />
      </div>
    </form>
  );
}

type ManualLine = { description: string; qty: string; rate: string };

/** Issues an invoice: for a month (from the prices and the suit packs counted), or written by hand. */
export function IssueInvoiceForm({ orgId, lastMonth, today, lang }: { orgId: string; lastMonth: string; today: string; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"monthly" | "manual">("monthly");
  const [month, setMonth] = useState(lastMonth);
  const [period, setPeriod] = useState({ periodStart: today, periodEnd: today });
  const [lines, setLines] = useState<ManualLine[]>([{ description: "", qty: "1", rate: "" }]);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [result, setResult] = useState<PlatformResult | null>(null);

  const input = () => (kind === "monthly" ? { kind, orgId, month } : { kind, orgId, ...period, lines });
  const setLine = (i: number, k: keyof ManualLine, v: string) => {
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
    setDraft(null);
  };

  return (
    <div className="space-y-4">
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="label mb-2">{t("Invoice for")}</legend>
        {(["monthly", "manual"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="radio"
              name={`kind-${orgId}`}
              checked={kind === k}
              onChange={() => {
                setKind(k);
                setDraft(null);
                setResult(null);
              }}
            />
            {k === "monthly" ? t("A month of suit packs (from the prices)") : t("Written by hand (e.g. a yearly scheme fee)")}
          </label>
        ))}
      </fieldset>

      {kind === "monthly" ? (
        <label className="block max-w-xs">
          <span className="label">{t("Month")}</span>
          <input className="input-glass mt-1" type="month" value={month} onChange={(e) => (setMonth(e.target.value), setDraft(null))} />
        </label>
      ) : (
        <div className="space-y-3">
          <div className="grid max-w-md gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">{t("Period from")}</span>
              <input className="input-glass mt-1" type="date" value={period.periodStart} onChange={(e) => (setPeriod((p) => ({ ...p, periodStart: e.target.value })), setDraft(null))} />
            </label>
            <label className="block">
              <span className="label">{t("Period to")}</span>
              <input className="input-glass mt-1" type="date" value={period.periodEnd} onChange={(e) => (setPeriod((p) => ({ ...p, periodEnd: e.target.value })), setDraft(null))} />
            </label>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <input className="input-glass min-w-56 flex-1" maxLength={200} aria-label={t("Description")} placeholder={t("Description")} value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} />
              <input className="input-glass w-20" inputMode="numeric" aria-label={t("Quantity")} value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value.replace(/\D/g, ""))} />
              <span className="muted">× ₹</span>
              <input className="input-glass w-32" inputMode="decimal" aria-label={t("Rate (₹)")} value={l.rate} onChange={(e) => setLine(i, "rate", e.target.value)} />
              {lines.length > 1 && (
                <button type="button" className="btn px-2 py-1 text-xs" onClick={() => (setLines((p) => p.filter((_, j) => j !== i)), setDraft(null))}>
                  {t("Remove")}
                </button>
              )}
            </div>
          ))}
          {lines.length < 20 && (
            <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setLines((p) => [...p, { description: "", qty: "1", rate: "" }])}>
              ＋ {t("Add a line")}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn px-4 py-2"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setResult(null);
              setDraft(await previewInvoice(input()));
            })
          }
        >
          {t("Work it out")}
        </button>
        {draft && !draft.ok && <p className="text-sm text-red-600 dark:text-red-400">{t(draft.error)}</p>}
      </div>

      {draft?.ok && (
        <div className="rounded-xl bg-current/5 p-4 text-sm">
          {draft.draft.suitPacks != null && (
            <p className="muted mb-2">
              {t("Suit packs counted")}: {draft.draft.suitPacks}
            </p>
          )}
          <table className="w-full">
            <tbody>
              {draft.draft.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-1">{l.description}</td>
                  <td className="py-1 text-right tabular-nums">
                    {l.qty} × {formatINR(l.ratePaise)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatINR(l.amountPaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr>
                <td colSpan={2} className="pt-2 text-right muted">{t("Taxable value")}</td>
                <td className="pt-2 text-right">{formatINR(draft.draft.taxablePaise)}</td>
              </tr>
              {draft.draft.igstPaise ? (
                <tr>
                  <td colSpan={2} className="text-right muted">IGST 18%</td>
                  <td className="text-right">{formatINR(draft.draft.igstPaise)}</td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={2} className="text-right muted">CGST 9% + SGST 9%</td>
                  <td className="text-right">{formatINR(draft.draft.cgstPaise + draft.draft.sgstPaise)}</td>
                </tr>
              )}
              <tr className="font-semibold">
                <td colSpan={2} className="text-right">{t("Total")}</td>
                <td className="text-right">{formatINR(draft.draft.totalPaise)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary px-4 py-2"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("Issue this invoice? Its number and amounts cannot be changed afterwards; it can only be cancelled."))) return;
                start(async () => {
                  const r = await issueInvoice(input());
                  setResult(r);
                  if (r.ok) {
                    setDraft(null);
                    router.refresh();
                  }
                });
              }}
            >
              {pending ? t("Issuing…") : t("Issue invoice")}
            </button>
          </div>
        </div>
      )}
      <Msg r={result} t={t} />
    </div>
  );
}

/** Mark paid (with a reference) or cancel one issued invoice. */
export function InvoiceStatusControl({ id, status, lang }: { id: string; status: "issued" | "paid" | "cancelled"; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ref, setRef] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<PlatformResult | null>(null);
  if (status === "cancelled") return null;
  const go = (s: "paid" | "cancelled") =>
    start(async () => {
      const r = await setInvoiceStatus({ id, status: s, paymentRef: s === "paid" ? ref : undefined });
      setResult(r);
      if (r.ok) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {status === "issued" && !open && (
        <button type="button" className="btn btn-primary px-3 py-1 text-xs" onClick={() => setOpen(true)}>
          {t("Mark paid")}
        </button>
      )}
      {status === "issued" && open && (
        <>
          <input className="input-glass w-40 py-1 text-xs" maxLength={60} aria-label={t("Payment reference (UTR / cheque no.)")} placeholder={t("UTR / cheque no.")} value={ref} onChange={(e) => setRef(e.target.value)} />
          <button type="button" className="btn btn-primary px-3 py-1 text-xs" disabled={pending || ref.trim().length < 3} onClick={() => go("paid")}>
            {t("Save")}
          </button>
        </>
      )}
      <button
        type="button"
        className="btn px-3 py-1 text-xs"
        disabled={pending}
        onClick={() => {
          if (window.confirm(t("Cancel this invoice? This cannot be undone; the period can then be invoiced again."))) go("cancelled");
        }}
      >
        {t("Cancel invoice")}
      </button>
      {result && !result.ok && <Msg r={result} t={t} />}
    </div>
  );
}

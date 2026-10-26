"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "./actions";
import { saveParticulars, type ParticularsForm } from "./particulars-actions";

type Props = {
  initial: ParticularsForm;
  /** Labels for the rows, in the same order as initial.parties / initial.loans. */
  partyNames: string[];
  loanNames: string[];
};

/** Suit particulars the office prints in the plaint, decree and vakalatnama but scans rarely carry. */
export function SuitParticulars({ initial, partyNames, loanNames }: Props) {
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const set = <K extends keyof ParticularsForm>(k: K, v: ParticularsForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const field = (label: string, value: string, onChange: (v: string) => void, placeholder = "") => (
    <label className="block">
      <span className="label">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input-glass mt-1" />
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {field("Bank officer (signs and verifies)", form.signatoryName, (v) => set("signatoryName", v), "Full name")}
        {field("Designation", form.signatoryDesignation, (v) => set("signatoryDesignation", v), "Branch Manager")}
        {field("Age", form.signatoryAge, (v) => set("signatoryAge", v), "years")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("B — Penal interest (₹)", form.penalInterest, (v) => set("penalInterest", v), "blank = decide later · 0 = NIL")}
        {field("C — Expenses incurred (₹)", form.expenses, (v) => set("expenses", v), "notice, legal charges")}
      </div>

      {form.parties.length > 0 && (
        <div className="space-y-2">
          <p className="label">Firm or company sued through a person (&ldquo;Through its Proprietor …&rdquo;)</p>
          {form.parties.map((p, i) => (
            <div key={p.id} className="grid items-end gap-3 sm:grid-cols-3">
              <span className="text-sm">{partyNames[i]}</span>
              {field("Capacity", p.throughCapacity, (v) => set("parties", form.parties.map((x, j) => (j === i ? { ...x, throughCapacity: v } : x))), "Proprietor / Partner / Director")}
              {field("Name", p.throughName, (v) => set("parties", form.parties.map((x, j) => (j === i ? { ...x, throughName: v } : x))))}
            </div>
          ))}
        </div>
      )}

      {form.loans.map((l, i) => (
        <div key={l.id} className="glass-card space-y-3 p-4">
          <p className="font-semibold">{loanNames[i]}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("Loan application date", l.applicationDate, (v) => set("loans", form.loans.map((x, j) => (j === i ? { ...x, applicationDate: v } : x))), "DD.MM.YYYY")}
            {field("Purpose", l.purpose, (v) => set("loans", form.loans.map((x, j) => (j === i ? { ...x, purpose: v } : x))), "for working capital")}
            {field("Tenure (months)", l.tenureMonths, (v) => set("loans", form.loans.map((x, j) => (j === i ? { ...x, tenureMonths: v } : x))), "blank for cash credit")}
          </div>
          <label className="block">
            <span className="label">Documents executed (one per line: Title | DD.MM.YYYY)</span>
            <textarea
              value={l.executedDocs}
              onChange={(e) => set("loans", form.loans.map((x, j) => (j === i ? { ...x, executedDocs: e.target.value } : x)))}
              rows={5}
              placeholder={"Demand Promissory Note | 12.07.2023\nGuarantee Agreement | 12.07.2023"}
              className="input-glass mt-1 font-mono text-sm"
            />
          </label>
        </div>
      ))}

      <button onClick={() => start(async () => setResult(await saveParticulars(form)))} disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save particulars"}
      </button>
      {result && (result.ok ? <p className="text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p> : <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>)}
    </div>
  );
}

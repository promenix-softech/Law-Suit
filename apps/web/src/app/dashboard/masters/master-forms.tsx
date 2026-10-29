"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../cases/[id]/actions";
import { saveBranch, saveCourt } from "./actions";

export type BranchRow = { id: string; bankName: string; shortCode: string; branchName: string; ifsc: string; address: string };
export type CourtRow = { id: string; name: string; district: string; courtType: "civil" | "commercial" | "drt"; state: string };

function Result({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return r.ok ? <p className="text-sm text-emerald-700 dark:text-emerald-300">✓ {r.message}</p> : <p className="text-sm text-red-600 dark:text-red-400">{r.error}</p>;
}

const input = (label: string, value: string, set: (v: string) => void, placeholder = "", wide = false) => (
  <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
    <span className="label">{label}</span>
    <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="input-glass mt-1" />
  </label>
);

const EMPTY_BRANCH: Omit<BranchRow, "id"> = { bankName: "", shortCode: "", branchName: "", ifsc: "", address: "" };

/** Add a branch, or edit one when `edit` is given. Picking a known bank fills its name and code. */
export function BranchForm({ banks, edit, onDone }: { banks: { name: string; shortCode: string }[]; edit?: BranchRow; onDone?: () => void }) {
  const [f, setF] = useState<Omit<BranchRow, "id">>(edit ?? EMPTY_BRANCH);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-3">
      {!edit && banks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="muted self-center text-xs">Known banks:</span>
          {banks.map((b) => (
            <button key={b.shortCode} type="button" className="btn px-2.5 py-1 text-xs" onClick={() => setF((x) => ({ ...x, bankName: b.name, shortCode: b.shortCode }))}>
              {b.shortCode}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {input("Bank name", f.bankName, set("bankName"), "State Bank of India")}
        {input("Short code", f.shortCode, set("shortCode"), "SBI")}
        {input("Branch name", f.branchName, set("branchName"), "Shivajinagar Branch, Pune")}
        {input("IFSC", f.ifsc, set("ifsc"), "SBIN0001234")}
        {input("Branch address (printed in the plaint)", f.address, set("address"), "", true)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="btn btn-primary"
          onClick={() =>
            start(async () => {
              const r = await saveBranch({ ...f, id: edit?.id });
              setResult(r);
              if (r.ok && !edit) setF(EMPTY_BRANCH);
              if (r.ok) onDone?.();
            })
          }
        >
          {pending ? "Saving…" : edit ? "Save branch" : "＋ Add branch"}
        </button>
        <Result r={result} />
      </div>
    </div>
  );
}

const EMPTY_COURT: Omit<CourtRow, "id"> = { name: "", district: "", courtType: "civil", state: "MH" };

export function CourtForm({ states, edit, onDone }: { states: [string, string][]; edit?: CourtRow; onDone?: () => void }) {
  const [f, setF] = useState<Omit<CourtRow, "id">>(edit ?? EMPTY_COURT);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {input("Court name (as in the plaint caption)", f.name, set("name"), "Civil Judge Senior Division, Pune", true)}
        {input("District", f.district, set("district"), "Pune")}
        <label className="block">
          <span className="label">Court type</span>
          <select value={f.courtType} onChange={(e) => set("courtType")(e.target.value)} className="input-glass mt-1">
            <option value="civil">Civil court</option>
            <option value="commercial">Commercial court</option>
            <option value="drt">Debts Recovery Tribunal (DRT)</option>
          </select>
        </label>
        <label className="block">
          <span className="label">State</span>
          <select value={f.state} onChange={(e) => set("state")(e.target.value)} className="input-glass mt-1">
            {states.map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="btn btn-primary"
          onClick={() =>
            start(async () => {
              const r = await saveCourt({ ...f, id: edit?.id });
              setResult(r);
              if (r.ok && !edit) setF(EMPTY_COURT);
              if (r.ok) onDone?.();
            })
          }
        >
          {pending ? "Saving…" : edit ? "Save court" : "＋ Add court"}
        </button>
        <Result r={result} />
      </div>
    </div>
  );
}

/** A list row with an inline Edit button that opens the same form pre-filled (passed as children). */
export function EditableRow({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl px-3 py-2.5 row-hover">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm">{summary}</div>
        <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "✎ Edit"}
        </button>
      </div>
      {open && <div className="mt-3">{children}</div>}
    </li>
  );
}

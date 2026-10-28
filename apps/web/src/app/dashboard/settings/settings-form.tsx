"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../cases/[id]/actions";
import { saveOfficeSettings } from "./actions";

export type SettingsFormValues = Record<
  | "firmName" | "firmTagline" | "advocateCode" | "sanadNo" | "address" | "contact" | "email" | "advocates"
  | "accountName" | "accountNo" | "accountType" | "bank" | "branch" | "ifsc" | "pan" | "refPrefix" | "noticeDays" | "noticeFeeRupees",
  string
> & { forum: "summary_suit" | "commercial"; margins: "office" | "efiling_rules" };

const orNull = (s: string) => (s.trim() ? s.trim() : null);
const intOrNull = (s: string) => (s.trim() ? Number(s.trim()) : null);

/** Form → the shapes the server validates (lib/office-profile.ts). */
function toInput(v: SettingsFormValues) {
  return {
    profile: {
      firmName: v.firmName.trim(),
      firmTagline: orNull(v.firmTagline),
      advocateCode: orNull(v.advocateCode),
      sanadNo: orNull(v.sanadNo),
      address: orNull(v.address),
      contact: orNull(v.contact),
      email: orNull(v.email),
      advocates: v.advocates.split("\n").map((a) => a.trim()).filter(Boolean),
      feeAccount: v.accountNo.trim()
        ? { accountName: v.accountName.trim(), accountNo: v.accountNo.trim(), accountType: orNull(v.accountType), bank: v.bank.trim(), branch: orNull(v.branch), ifsc: orNull(v.ifsc)?.toUpperCase() ?? null }
        : null,
      pan: orNull(v.pan)?.toUpperCase() ?? null,
      refPrefix: orNull(v.refPrefix),
      noticeDays: intOrNull(v.noticeDays),
      noticeFeeRupees: intOrNull(v.noticeFeeRupees),
    },
    settings: { forum: v.forum, margins: v.margins },
  };
}

export function SettingsForm({ initial }: { initial: SettingsFormValues }) {
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const field = (k: keyof SettingsFormValues, label: string, placeholder = "") => (
    <label className="block">
      <span className="label">{label}</span>
      <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={placeholder} className="input-glass mt-1" />
    </label>
  );

  return (
    <div className="space-y-6">
      <section className="glass-card space-y-3 p-5">
        <h2 className="font-semibold">Drafting</h2>
        <label className="block">
          <span className="label">Bank recovery suits are filed as</span>
          <select value={v.forum} onChange={(e) => setV({ ...v, forum: e.target.value as SettingsFormValues["forum"] })} className="input-glass mt-1">
            <option value="summary_suit">Order XXXVII summary suit in the civil court (office practice)</option>
            <option value="commercial">Commercial suit with Sec 12A mediation from ₹3 lakh</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Margins of court papers</span>
          <select value={v.margins} onChange={(e) => setV({ ...v, margins: e.target.value as SettingsFormValues["margins"] })} className="input-glass mt-1">
            <option value="office">Office papers: left 1.5&quot;, right 1&quot;, top/bottom 1.26&quot;</option>
            <option value="efiling_rules">e-Filing Rules profile: left 1.75&quot;, right 1&quot;, top/bottom 1.5&quot;</option>
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("noticeDays", "Demand notice: days to pay", "7")}
          {field("noticeFeeRupees", "Demand notice: fee claimed (₹)", "e.g. 3500")}
        </div>
      </section>

      <section className="glass-card space-y-3 p-5">
        <h2 className="font-semibold">Office (vakalatnama, letterhead, fee letter)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("firmName", "Firm name")}
          {field("firmTagline", "Tagline", "Advocates & Legal Consultants")}
          {field("advocateCode", "Advocate code")}
          {field("sanadNo", "Sanad no.")}
          {field("contact", "Contact")}
          {field("email", "E-mail")}
          {field("refPrefix", "Reference prefix", "e.g. DLA")}
        </div>
        {field("address", "Office address")}
        <label className="block">
          <span className="label">Advocates named in the vakalatnama (one per line)</span>
          <textarea value={v.advocates} onChange={(e) => setV({ ...v, advocates: e.target.value })} rows={4} className="input-glass mt-1" />
        </label>
      </section>

      <section className="glass-card space-y-3 p-5">
        <h2 className="font-semibold">Account for court fee and charges</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("accountName", "Account name")}
          {field("accountNo", "Account no.")}
          {field("accountType", "Account type", "Current")}
          {field("bank", "Bank")}
          {field("branch", "Branch")}
          {field("ifsc", "IFSC")}
          {field("pan", "PAN")}
        </div>
      </section>

      <button onClick={() => start(async () => setResult(await saveOfficeSettings(toInput(v))))} disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save office settings"}
      </button>
      {result && (result.ok ? <p className="text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p> : <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>)}
    </div>
  );
}

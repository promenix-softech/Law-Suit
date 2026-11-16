"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { translator, type Lang } from "@/lib/i18n";
import { createOffice, type NewOfficeResult } from "../actions";

/** A firm code from the office name: small letters, digits and "-", starting with a letter. */
function suggestCode(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  return s;
}

export function NewOfficeForm({ lang }: { lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<NewOfficeResult | null>(null);
  const [f, setF] = useState({ name: "", firmCode: "", adminName: "", adminEmail: "" });
  const [codeTouched, setCodeTouched] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await createOffice(f);
      setResult(r);
      if (r.orgId) router.push(`/dashboard/platform/${r.orgId}?opened=${r.ok ? "1" : "0"}`);
    });
  }

  return (
    <form onSubmit={submit} className="glass-card fade-up max-w-2xl space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="label">{t("Office name")}</span>
          <input
            className="input-glass mt-1"
            required
            minLength={3}
            maxLength={120}
            value={f.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!codeTouched) set("firmCode", suggestCode(e.target.value));
            }}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">{t("Firm code")}</span>
          <input
            className="input-glass mt-1"
            required
            pattern="[a-z][a-z0-9\-]{1,29}"
            maxLength={30}
            value={f.firmCode}
            onChange={(e) => {
              setCodeTouched(true);
              set("firmCode", e.target.value.toLowerCase());
            }}
          />
          <span className="muted mt-1 block text-xs">
            {t("Small letters, digits and -. The office signs in with this code")}
          </span>
        </label>
        <label className="block">
          <span className="label">{t("Admin's full name")}</span>
          <input className="input-glass mt-1" required minLength={2} maxLength={120} value={f.adminName} onChange={(e) => set("adminName", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t("Admin's email")}</span>
          <input className="input-glass mt-1" type="email" required value={f.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} />
        </label>
      </div>
      <p className="muted text-xs">{t("The admin gets an email to set their own password, then adds the office's people.")}</p>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn btn-primary px-5 py-2" disabled={pending}>
          {pending ? t("Opening…") : t("Open the office")}
        </button>
        {result && !result.ok && !result.orgId && <p className="text-sm text-red-600 dark:text-red-400">{t(result.error)}</p>}
      </div>
    </form>
  );
}

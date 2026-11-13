"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BankClaimForum, CourtOption } from "@civil-suits/domain";
import { needsOwnTick, type IntakeField } from "@/lib/extract/intake";
import { translator, type Lang, type T } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { uploadName } from "@/lib/upload-name";
import { CourtPicker } from "./court-picker";
import { discardIntake, intakeFileUrl, openCaseFromIntake, readIntake, startIntake } from "./intake-actions";

type Person = { id: string; name: string };
export type BranchOption = { id: string; label: string; ifsc: string | null; name: string };

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const POLL_MS = 3000;
const POLL_LIMIT = 80; // about four minutes

const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Borrower and guarantor", keys: ["borrower_name", "borrower_address", "guarantor_name", "guarantor_address"] },
  {
    title: "Loan",
    keys: [
      "facility_type", "loan_account_number", "sanction_date", "sanction_amount", "interest_rate", "npa_date",
      "outstanding_amount", "outstanding_as_on", "tenure_months", "loan_purpose", "application_date",
    ],
  },
  { title: "Bank", keys: ["bank_name", "branch_name", "ifsc"] },
  { title: "Documents executed", keys: ["executed_documents"] },
];

/** Rupees as typed ("11,77,480.00") to paise, or null. Only for the court suggestion; the server re-checks every value. */
function paiseOf(v: string | undefined): number | null {
  const n = Number((v ?? "").replace(/[,\s₹]/g, "").replace(/^rs\.?/i, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function Confidence({ c, t }: { c: number | null; t: T }) {
  if (c == null) return null;
  const pct = Math.round(c * 100);
  const tone = c >= 0.85 ? "pill-green" : c >= 0.6 ? "pill-amber" : "pill-red";
  return <span className={`pill ${tone} px-2 py-0 text-[11px]`}>{pct}% {t("sure")}</span>;
}

export function IntakeFlow({
  orgId,
  userId,
  suggestedNo,
  branches,
  courts,
  drafters,
  approvers,
  officeForum,
  onTypeInstead,
  lang = "en",
}: {
  orgId: string;
  userId: string;
  suggestedNo: string;
  branches: BranchOption[];
  courts: CourtOption[];
  drafters: Person[];
  approvers: Person[];
  officeForum: BankClaimForum;
  onTypeInstead: () => void;
  lang?: Lang;
}) {
  const t = translator(lang);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "reading" | "review">("pick");
  const [fileName, setFileName] = useState<string | null>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [fields, setFields] = useState<IntakeField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [openedCaseId, setOpenedCaseId] = useState<string | null>(null);

  // Case details
  const [caseNo, setCaseNo] = useState(suggestedNo);
  const [branchId, setBranchId] = useState("");
  const [courtId, setCourtId] = useState("");
  const [drafterId, setDrafterId] = useState("");
  const [approverId, setApproverId] = useState("");
  const [urgent, setUrgent] = useState(false);

  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const claimPaise = paiseOf(values.outstanding_amount);

  function showFields(list: IntakeField[]) {
    setFields(list);
    setValues(Object.fromEntries(list.map((f) => [f.key, f.value])));
    setTicks(Object.fromEntries(list.map((f) => [f.key, f.checked])));
    // The branch from the file: by IFSC, else by name.
    const ifsc = list.find((f) => f.key === "ifsc")?.value.toUpperCase();
    const name = list.find((f) => f.key === "branch_name")?.value.toLowerCase();
    const match = branches.find((b) => ifsc && b.ifsc?.toUpperCase() === ifsc) ?? branches.find((b) => name && b.name.toLowerCase() && name.includes(b.name.toLowerCase()));
    if (match) setBranchId(match.id);
    setPhase("review");
  }

  async function onUpload() {
    const file = input.current?.files?.[0];
    setError(null);
    if (!file) return setError(t("Choose the bank's file first."));
    if (!ALLOWED.includes(file.type)) return setError(t("Only PDF, JPG or PNG files."));
    if (file.size > MAX_BYTES) return setError(t("The file is larger than 25 MB."));
    const name = uploadName(file.type);
    if (!name) return setError(t("Only PDF, JPG or PNG files."));
    setBusy(true);
    try {
      const path = `${orgId}/${userId}/${name}`;
      const up = await createClient().storage.from("case-intake").upload(path, file, { contentType: file.type });
      if (up.error) return setError(t("Upload was not allowed. Only an admin can open cases."));
      const started = await startIntake(path);
      if (!started.ok) return setError(t(started.error));
      setIntakeId(started.intakeId);
      setPhase("reading");
      for (let i = 0; i < POLL_LIMIT; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        setSeconds((i + 1) * (POLL_MS / 1000));
        const r = await readIntake(started.intakeId);
        if (!r.ok) {
          await discardIntake(started.intakeId); // the file does not stay behind
          setError(t(r.error));
          setPhase("pick");
          return;
        }
        if (r.done) {
          if (r.failed) setNotice(`${t(r.failed)} ${t("Type the values in below — the file will still be kept with the case.")}`);
          showFields(r.fields);
          return;
        }
      }
      await discardIntake(started.intakeId);
      setError(t("The AI is taking too long. Try again in a minute, or type the case in."));
      setPhase("pick");
    } finally {
      setBusy(false);
    }
  }

  async function onViewFile() {
    if (!intakeId) return;
    const r = await intakeFileUrl(intakeId);
    if (r.ok) window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function onStartAgain() {
    if (intakeId) await discardIntake(intakeId);
    setIntakeId(null);
    setFields([]);
    setNotice(null);
    setError(null);
    setFieldErrors({});
    setFileName(null);
    setPhase("pick");
  }

  async function onOpen() {
    if (!intakeId) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const r = await openCaseFromIntake({
        intakeId,
        header: { caseNo, branchId, courtId, drafterId, approverId, urgent },
        fields: fields.map((f) => ({ key: f.key, value: values[f.key] ?? "", checked: !!ticks[f.key] })),
      });
      if (!r.ok) {
        setError(t(r.error));
        setFieldErrors(r.fieldErrors ?? {});
        if (r.caseId) setOpenedCaseId(r.caseId);
        return;
      }
      router.push(`/dashboard/cases/${r.caseId}`);
    } finally {
      setBusy(false);
    }
  }

  if (phase === "pick" || phase === "reading") {
    return (
      <div className="space-y-4">
        <ol className="muted flex flex-wrap gap-3 text-xs">
          <li className="font-semibold text-current">① {t("Upload the bank's file")}</li>
          <li>② {t("Check what the AI read")}</li>
          <li>③ {t("Open the case")}</li>
        </ol>
        {phase === "pick" ? (
          <>
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-current/20 p-8 text-center hover:border-violet-400">
              <input
                ref={input}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
              <span className="block text-3xl">📄</span>
              <span className="mt-2 block font-semibold">{fileName ? fileName.slice(0, 40) : t("Choose the bank's loan file")}</span>
              <span className="muted mt-1 block text-xs">{t("PDF, JPG or PNG · up to 10 pages · the AI reads it in about a minute")}</span>
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={onTypeInstead} className="muted text-sm hover:underline">
                {t("Type the case in instead")}
              </button>
              <button type="button" onClick={onUpload} disabled={busy || !fileName} className="btn btn-primary px-6 py-3">
                {busy ? t("Uploading…") : `✦ ${t("Read it with AI")}`}
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-current/10 p-8 text-center" role="status">
            <span className="block text-3xl">✦</span>
            <p className="mt-2 font-semibold">{t("The AI is reading the file…")}</p>
            <p className="muted mt-1 text-sm">
              {seconds}s · {t("usually under a minute. Nothing is saved to a case until you open it.")}
            </p>
          </div>
        )}
      </div>
    );
  }

  const clash = drafterId && drafterId === approverId;
  // Fields the AI found nothing for are folded away (fixed at the time of reading, so typing in one does not move it).
  const missing = fields.filter((f) => !f.asRead);
  const missingKeys = new Set(missing.map((f) => f.key));
  const found = fields.filter((f) => f.asRead);
  const tickedCount = fields.filter((f) => ticks[f.key]).length;
  const toTick = found.filter((f) => !ticks[f.key] && needsOwnTick(f.kind) && !f.problem).length;
  const borrowerOk = !!values.borrower_name?.trim() && !!ticks.borrower_name;
  const unticked = fields.filter((f) => (values[f.key] ?? "").trim() && !ticks[f.key]).length;

  function row(f: IntakeField) {
    const v = values[f.key] ?? "";
    const long = f.kind === "doclist" || f.key.endsWith("address");
    return (
      <div key={f.key} className="rounded-xl border border-current/10 p-3" data-field={f.key}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`f-${f.key}`} className="label">
            {t(f.label)}
          </label>
          <span className="flex items-center gap-2">
            <Confidence c={f.confidence} t={t} />
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={!!ticks[f.key]}
                disabled={!v.trim()}
                onChange={(e) => setTicks((t) => ({ ...t, [f.key]: e.target.checked }))}
                className="h-5 w-5 accent-violet-500"
                aria-label={`${f.label} checked`}
              />
              {t("Checked")}
            </label>
          </span>
        </div>
        {long ? (
          <textarea
            id={`f-${f.key}`}
            rows={f.kind === "doclist" ? 4 : 2}
            value={v}
            onChange={(e) => {
              setValues((x) => ({ ...x, [f.key]: e.target.value }));
              setTicks((t) => ({ ...t, [f.key]: !!e.target.value.trim() }));
            }}
            className="input-glass mt-2"
          />
        ) : (
          <input
            id={`f-${f.key}`}
            value={v}
            onChange={(e) => {
              setValues((x) => ({ ...x, [f.key]: e.target.value }));
              setTicks((t) => ({ ...t, [f.key]: !!e.target.value.trim() }));
            }}
            className="input-glass mt-2"
          />
        )}
        {f.asRead && f.asRead !== v && (
          <p className="muted mt-1 text-xs">
            {t("As read")}: {f.asRead}
          </p>
        )}
        {!f.asRead && <p className="muted mt-1 text-xs">{t("Not found in the file — type it if you have it.")}</p>}
        {f.problem && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {t("Not accepted as read")}: {t(f.problem)}
          </p>
        )}
        {fieldErrors[f.key] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors[f.key]}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="muted flex flex-wrap gap-3 text-xs">
        <li>① {t("Upload")} ✓</li>
        <li className="font-semibold text-current">② {t("Check what the AI read")}</li>
        <li>③ {t("Open the case")}</li>
      </ol>
      {notice && <p className="rounded-xl bg-amber-500/10 p-3 text-sm">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="muted text-sm">
          {t("Compare each value with the file and tick it. Change anything that is wrong. Unticked values go to the drafter to check.")}
        </p>
        <button type="button" onClick={onViewFile} className="btn px-4 py-2 text-sm">
          👁 {t("Open the file")}
        </button>
      </div>

      <p className="rounded-xl bg-violet-500/10 p-3 text-sm" data-testid="intake-summary">
        {t("Values filled by the AI")}: <strong>{found.length}</strong> / {fields.length} · {t("Ticked")}: <strong>{tickedCount}</strong>.
        {toTick > 0 && (
          <>
            {" "}
            {t("Amounts, dates and numbers to check and tick one by one")}: <strong>{toTick}</strong>.
          </>
        )}
      </p>

      {GROUPS.map((g) => {
        const list = g.keys.map((k) => byKey.get(k)).filter((f): f is IntakeField => !!f && !missingKeys.has(f.key));
        if (!list.length) return null;
        return (
          <section key={g.title} className="space-y-3">
            <h3 className="font-semibold">{t(g.title)}</h3>
            {list.map(row)}
          </section>
        );
      })}

      {missing.length > 0 && (
        <details className="space-y-3 rounded-xl border border-current/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            {t("Not found in the file")} ({missing.length}) — {t("add them if you have them")}
          </summary>
          <div className="mt-3 space-y-3">{missing.map(row)}</div>
        </details>
      )}

      <section className="space-y-4 rounded-2xl border border-current/10 p-4">
        <h3 className="font-semibold">③ {t("Case details")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t("Internal case no.")}</span>
            <input value={caseNo} onChange={(e) => setCaseNo(e.target.value)} className="input-glass mt-2" />
          </label>
          <label className="block">
            <span className="label">{t("Bank branch")}</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input-glass mt-2">
              <option value="" disabled>
                {t("Choose…")}
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CourtPicker courts={courts} claimPaise={claimPaise} urgent={urgent} officeForum={officeForum} value={courtId} onChange={setCourtId} lang={lang} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-5 w-5 accent-violet-500" />
          {t("Urgent interim relief (no 12A mediation)")}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t("Drafter")}</span>
            <select value={drafterId} onChange={(e) => setDrafterId(e.target.value)} className="input-glass mt-2">
              <option value="" disabled>
                {t("Choose…")}
              </option>
              {drafters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t("Approver")}</span>
            <select value={approverId} onChange={(e) => setApproverId(e.target.value)} className="input-glass mt-2">
              <option value="" disabled>
                {t("Choose…")}
              </option>
              {approvers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {clash && <p className="text-sm text-red-600 dark:text-red-400">{t("Drafter and approver must be different people (maker–checker).")}</p>}
        {!borrowerOk && <p className="text-sm text-amber-700 dark:text-amber-300">{t("Check and tick the borrower's name — the case is opened in that name.")}</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {openedCaseId && (
          <a href={`/dashboard/cases/${openedCaseId}`} className="btn btn-primary px-4 py-2 text-sm">
            {t("Open the case")} →
          </a>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onStartAgain} className="muted text-sm hover:underline">
            {t("Start again with another file")}
          </button>
          <button
            type="button"
            onClick={onOpen}
            disabled={busy || !!openedCaseId || !!clash || !borrowerOk || !branchId || !courtId || !drafterId || !approverId}
            className="btn btn-primary px-6 py-3"
          >
            {busy ? t("Opening…") : t("Open case")}
          </button>
        </div>
        {unticked > 0 && (
          <p className="muted text-xs">
            {t("Values not ticked, for the drafter to check on the case page")}: {unticked}
          </p>
        )}
      </section>
    </div>
  );
}

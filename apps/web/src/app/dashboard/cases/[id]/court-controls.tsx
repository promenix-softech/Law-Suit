"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DISPOSALS,
  DISPOSAL_LABEL,
  HEARING_PURPOSES,
  HEARING_PURPOSE_LABEL,
  daysBetween,
  hearingDiary,
  type Disposal,
  type HearingPurpose,
  type HearingRow,
} from "@civil-suits/domain";
import { translator, type Lang, type T } from "@/lib/i18n";
import type { ActionResult } from "./actions";
import { addHearing, addLimitationEvent, disposeCase, recordHearing, removeHearing, removeLimitationEvent } from "./court-actions";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="fade-up text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
  ) : (
    <p className="fade-up text-sm text-red-600 dark:text-red-400">{result.error}</p>
  );
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

function PurposeSelect({ value, onChange, t }: { value: HearingPurpose; onChange: (p: HearingPurpose) => void; t: T }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as HearingPurpose)} className="input-glass mt-1">
      {HEARING_PURPOSES.map((p) => (
        <option key={p} value={p}>
          {t(HEARING_PURPOSE_LABEL[p])}
        </option>
      ))}
    </select>
  );
}

export type HearingView = {
  caseId: string;
  status: string;
  canEdit: boolean;
  /** IST calendar date from the server, so server and browser agree on "today". */
  today: string;
  rows: HearingRow[];
  disposal: { on: string; result: Disposal; note: string | null } | null;
};

/** One date that has passed: what happened, and the next date the court gave. */
function WriteUp({ v, row, lang }: { v: HearingView; row: HearingRow; lang: Lang }) {
  const t = translator(lang);
  const { pending, result, run } = useAction();
  const [outcome, setOutcome] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextPurpose, setNextPurpose] = useState<HearingPurpose>("other");
  return (
    <li className="rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-400/40">
      <p className="font-semibold">
        {fmt(row.date)} · {t(HEARING_PURPOSE_LABEL[row.purpose])}
      </p>
      <p className="muted text-sm">{t("This date has passed. Write what happened.")}</p>
      {v.canEdit && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="label">{t("What happened")} *</span>
            <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={2000} rows={2} className="input-glass mt-1" />
          </label>
          <label className="block text-sm">
            <span className="label">{t("Next date")}</span>
            <input type="date" value={nextDate} min={v.today} onChange={(e) => setNextDate(e.target.value)} className="input-glass mt-1" />
          </label>
          <label className="block text-sm">
            <span className="label">{t("Next date is for")}</span>
            <PurposeSelect value={nextPurpose} onChange={setNextPurpose} t={t} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              className="btn btn-primary px-4 py-2 text-sm"
              disabled={pending || !outcome.trim()}
              onClick={() => run(() => recordHearing({ caseId: v.caseId, hearingId: row.id, outcome, nextDate, nextPurpose }))}
            >
              {pending ? `${t("Saving")}…` : `✓ ${t("Save")}`}
            </button>
            <button
              className="muted text-xs underline"
              disabled={pending}
              onClick={() => run(() => removeHearing({ caseId: v.caseId, hearingId: row.id }))}
            >
              {t("Entered by mistake — remove")}
            </button>
          </div>
        </div>
      )}
      <div className="mt-2">
        <Status result={result} />
      </div>
    </li>
  );
}

/** Hearing diary of a filed suit: the next date, dates to write up, the history, and the disposal. */
export function HearingsPanel({ v, lang }: { v: HearingView; lang: Lang }) {
  const t = translator(lang);
  const { pending, result, run } = useAction();
  const diary = hearingDiary(v.rows, v.today);
  const inCourt = v.status === "filed" || v.status === "listed";
  const [date, setDate] = useState("");
  const [purpose, setPurpose] = useState<HearingPurpose>(v.rows.length ? "other" : "first_date");
  const [disposedOn, setDisposedOn] = useState(v.today);
  const [disposal, setDisposal] = useState<Disposal>("decreed");
  const [note, setNote] = useState("");
  const left = diary.next ? daysBetween(v.today, diary.next.date) : null;

  return (
    <div className="space-y-4">
      {v.disposal && (
        <div className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/40">
          <p className="font-semibold">
            {t("Disposed")} · {t(DISPOSAL_LABEL[v.disposal.result])} · {fmt(v.disposal.on)}
          </p>
          {v.disposal.note && <p className="muted text-sm">{v.disposal.note}</p>}
        </div>
      )}

      {inCourt && diary.next && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-violet-500/10 p-4 ring-1 ring-violet-400/40">
          <div className="min-w-0 flex-1">
            <p className="label">{t("Next date")}</p>
            <p className="text-xl font-semibold">{fmt(diary.next.date)}</p>
            <p className="muted text-sm">{t(HEARING_PURPOSE_LABEL[diary.next.purpose])}</p>
          </div>
          <span className={`pill ${left != null && left <= 1 ? "pill-red" : left != null && left <= 7 ? "pill-amber" : "pill-neutral"}`}>
            {left === 0 ? t("today") : `${left} ${t("days left")}`}
          </span>
          {v.canEdit && (
            <button
              className="muted text-xs underline"
              disabled={pending}
              onClick={() => run(() => removeHearing({ caseId: v.caseId, hearingId: diary.next!.id }))}
            >
              {t("Entered by mistake — remove")}
            </button>
          )}
        </div>
      )}

      {inCourt && diary.toRecord.length > 0 && (
        <ul className="space-y-3">
          {diary.toRecord.map((row) => (
            <WriteUp key={row.id} v={v} row={row} lang={lang} />
          ))}
        </ul>
      )}

      {inCourt && v.canEdit && !diary.next && (
        <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block text-sm">
            <span className="label">{v.rows.length ? t("Next date") : t("First hearing date")} *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-glass mt-1" />
          </label>
          <label className="block text-sm">
            <span className="label">{t("Date is for")}</span>
            <PurposeSelect value={purpose} onChange={setPurpose} t={t} />
          </label>
          <button
            className="btn btn-primary px-4 py-2 text-sm"
            disabled={pending || !date}
            onClick={() => run(() => addHearing({ caseId: v.caseId, date, purpose }), () => setDate(""))}
          >
            {pending ? `${t("Saving")}…` : `✓ ${t("Save date")}`}
          </button>
        </div>
      )}
      {inCourt && !v.canEdit && !diary.next && !diary.toRecord.length && <p className="muted text-sm">{t("No hearing date yet.")}</p>}

      <Status result={result} />

      {diary.past.length > 0 && (
        <details open={diary.past.length <= 3}>
          <summary className="cursor-pointer text-sm font-semibold">
            {t("Earlier dates")} ({diary.past.length})
          </summary>
          <ol className="mt-2 space-y-2 border-l border-current/10 pl-4">
            {diary.past.map((row) => (
              <li key={row.id} className="text-sm">
                <span className="font-medium">{fmt(row.date)}</span>
                <span className="muted"> · {t(HEARING_PURPOSE_LABEL[row.purpose])}</span>
                <p className="whitespace-pre-wrap">{row.outcome}</p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {inCourt && v.canEdit && (
        <details>
          <summary className="muted cursor-pointer text-sm">{t("The suit is over — record the result")}</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="label">{t("Result")} *</span>
              <select value={disposal} onChange={(e) => setDisposal(e.target.value as Disposal)} className="input-glass mt-1">
                {DISPOSALS.map((d) => (
                  <option key={d} value={d}>
                    {t(DISPOSAL_LABEL[d])}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="label">{t("Date of the order")} *</span>
              <input type="date" value={disposedOn} max={v.today} onChange={(e) => setDisposedOn(e.target.value)} className="input-glass mt-1" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="label">{t("Note")}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="input-glass mt-1" />
            </label>
            <div className="sm:col-span-2">
              <button
                className="btn px-4 py-2 text-sm"
                disabled={pending || !disposedOn}
                onClick={() => run(() => disposeCase({ caseId: v.caseId, disposedOn, result: disposal, note: note || undefined }))}
              >
                {pending ? `${t("Saving")}…` : t("Record the result and close the case")}
              </button>
              <p className="muted mt-2 text-xs">{t("After this only an admin can change it.")}</p>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

export type LimitationView = {
  caseId: string;
  canEdit: boolean;
  today: string;
  /** Watch date computed in code (packages/domain), or null without an NPA date. */
  due: string | null;
  daysLeft: number | null;
  events: { id: string; kind: "acknowledgment" | "part_payment"; on: string; note: string | null; late: boolean }[];
};

const KIND_LABEL = { acknowledgment: "Written acknowledgement", part_payment: "Part-payment" } as const;

/** Limitation watch date and the acknowledgements / part-payments that restart it. */
export function LimitationPanel({ v, lang }: { v: LimitationView; lang: Lang }) {
  const t = translator(lang);
  const { pending, result, run } = useAction();
  const [kind, setKind] = useState<"acknowledgment" | "part_payment">("acknowledgment");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      {v.due ? (
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="label">{t("File the suit before")}</p>
            <p className="text-xl font-semibold">{fmt(v.due)}</p>
          </div>
          {v.daysLeft != null && (
            <span className={`pill ${v.daysLeft <= 30 ? "pill-red" : v.daysLeft <= 180 ? "pill-amber" : "pill-green"}`}>
              {v.daysLeft < 0 ? `${-v.daysLeft} ${t("days overdue")}` : `${v.daysLeft} ${t("days left")}`}
            </span>
          )}
        </div>
      ) : (
        <p className="muted text-sm">{t("Add the NPA date to see the limitation watch date.")}</p>
      )}
      <p className="muted text-xs">
        {t("A watch date for the office: 3 years from the estimated default, restarted by each written acknowledgement or part-payment made in time. The advocate confirms the real date.")}
      </p>

      {v.events.length > 0 && (
        <ul className="space-y-1 text-sm">
          {v.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <span className={`pill ${e.late ? "pill-red" : "pill-neutral"}`}>{t(KIND_LABEL[e.kind])}</span>
              <span className="font-medium">{fmt(e.on)}</span>
              {e.note && <span className="muted">{e.note}</span>}
              {e.late && <span className="text-red-600 dark:text-red-400">{t("after the period had run out — does not extend it")}</span>}
              {v.canEdit && (
                <button
                  className="muted ml-auto text-xs underline"
                  disabled={pending}
                  onClick={() => run(() => removeLimitationEvent({ caseId: v.caseId, eventId: e.id }))}
                >
                  {t("Remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {v.canEdit && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">＋ {t("Add an acknowledgement or part-payment")}</summary>
          <div className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <label className="block text-sm">
              <span className="label">{t("Kind")}</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="input-glass mt-1">
                <option value="acknowledgment">{t(KIND_LABEL.acknowledgment)}</option>
                <option value="part_payment">{t(KIND_LABEL.part_payment)}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="label">{t("Date")} *</span>
              <input type="date" value={date} max={v.today} onChange={(e) => setDate(e.target.value)} className="input-glass mt-1" />
            </label>
            <label className="block text-sm">
              <span className="label">{t("Note")}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t("e.g. balance confirmation letter")} className="input-glass mt-1" />
            </label>
            <button
              className="btn btn-primary px-4 py-2 text-sm"
              disabled={pending || !date}
              onClick={() =>
                run(
                  () => addLimitationEvent({ caseId: v.caseId, kind, date, note: note || undefined }),
                  () => {
                    setDate("");
                    setNote("");
                  },
                )
              }
            >
              {pending ? `${t("Saving")}…` : `✓ ${t("Save")}`}
            </button>
          </div>
        </details>
      )}
      <Status result={result} />
    </div>
  );
}

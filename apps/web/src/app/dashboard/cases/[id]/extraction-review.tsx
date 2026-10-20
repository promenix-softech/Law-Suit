"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyVerifiedFields, verifyField } from "./extract-actions";

export type ReviewRow = {
  key: string;
  label: string;
  raw: string;
  /** Value prefilled in the input (normalised and editable), or the raw text if it failed validation. */
  initial: string;
  display: string | null;
  reason: string | null;
  confidence: number | null;
  verified: boolean;
  documentId: string | null;
};

const LOW = 0.85;

function ConfidencePill({ c, invalid }: { c: number | null; invalid: boolean }) {
  if (invalid) return <span className="pill pill-red">Invalid</span>;
  if (c == null) return <span className="pill pill-neutral">—</span>;
  return <span className={`pill ${c >= LOW ? "pill-green" : "pill-amber"}`}>{Math.round(c * 100)}%</span>;
}

function Row({ r, caseId, canEdit }: { r: ReviewRow; caseId: string; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(r.initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const invalid = !!r.reason;
  const needsLook = invalid || (r.confidence != null && r.confidence < LOW);

  return (
    <tr className={`row-hover align-top ${needsLook && !r.verified ? "bg-amber-500/5" : ""}`}>
      <td className="px-3 py-3 font-medium">{r.label}</td>
      <td className="muted px-3 py-3">
        <span className="line-clamp-2" title={r.raw}>
          {r.raw}
        </span>
        {r.documentId && (
          <Link href={`/dashboard/cases/${caseId}/documents/${r.documentId}`} className="text-xs underline">
            source
          </Link>
        )}
      </td>
      <td className="px-3 py-3">
        <ConfidencePill c={r.confidence} invalid={invalid} />
        {r.reason && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{r.reason}</p>}
      </td>
      <td className="px-3 py-3">
        {canEdit ? (
          <input value={value} onChange={(e) => setValue(e.target.value)} className="input-glass py-1.5 text-sm" aria-label={r.label} />
        ) : (
          <span>{r.display ?? "—"}</span>
        )}
        {err && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{err}</p>}
      </td>
      <td className="px-3 py-3 text-right">
        {r.verified && value === r.initial ? (
          <span className="pill pill-green">Verified</span>
        ) : canEdit ? (
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await verifyField({ caseId, fieldKey: r.key, value });
                setErr(res.ok ? null : res.error);
                if (res.ok) router.refresh();
              })
            }
            className="btn px-3 py-1 text-xs"
          >
            {pending ? "…" : "Verify"}
          </button>
        ) : (
          <span className="pill pill-neutral">Unverified</span>
        )}
      </td>
    </tr>
  );
}

export function ExtractionReview({ rows, caseId, canEdit }: { rows: ReviewRow[]; caseId: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const verified = rows.filter((r) => r.verified).length;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="label">
              <th className="px-3 py-2 font-semibold">Field</th>
              <th className="px-3 py-2 font-semibold">As read from document</th>
              <th className="px-3 py-2 font-semibold">Confidence</th>
              <th className="px-3 py-2 font-semibold">Value to use</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.key} r={r} caseId={caseId} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-sm">
          {verified} of {rows.length} verified · amounts in ₹, dates as DD-MM-YYYY, rate in % p.a.
        </p>
        {canEdit && (
          <div className="flex items-center gap-3">
            {msg && <span className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{msg.text}</span>}
            <button
              disabled={pending || !verified}
              onClick={() =>
                start(async () => {
                  const r = await applyVerifiedFields(caseId);
                  setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
                  router.refresh();
                })
              }
              className="btn btn-primary"
            >
              {pending ? "Applying…" : "Apply verified values to case"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

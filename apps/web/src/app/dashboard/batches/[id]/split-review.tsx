"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSplit, type ActionResult } from "../actions";

export type ReviewPage = {
  pageNo: number;
  cls: string;
  confidence: number | null;
  last4: string | null;
  borrower: string | null;
  group: number;
  flags: string[];
};

const CLASS_LABEL: Record<string, string> = {
  sanction_letter: "Sanction letter",
  loan_agreement: "Loan agreement",
  account_statement: "Statement of account",
  npa_notice: "NPA notice",
  demand_notice: "Demand notice",
  guarantee: "Guarantee",
  kyc: "KYC",
  other: "Other",
};

type Target = { mode: "new"; caseNo: string } | { mode: "existing"; caseId: string };

export function SplitReview({
  batchId,
  pages,
  cases,
  pdfUrl,
}: {
  batchId: string;
  pages: ReviewPage[];
  cases: { id: string; no: string }[];
  pdfUrl: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [groupOf, setGroupOf] = useState<Record<number, number>>(() => Object.fromEntries(pages.map((p) => [p.pageNo, p.group])));

  const groups = useMemo(() => {
    const m = new Map<number, ReviewPage[]>();
    for (const p of pages) {
      const g = groupOf[p.pageNo] ?? p.group;
      m.set(g, [...(m.get(g) ?? []), p]);
    }
    return [...m.entries()].sort(([a], [b]) => a - b);
  }, [pages, groupOf]);

  const suggested = (g: number, ps: ReviewPage[]) => {
    const last4 = ps.find((p) => p.last4)?.last4;
    return `INTAKE-${batchId.slice(0, 4).toUpperCase()}-${last4 ?? g}`;
  };
  const [targets, setTargets] = useState<Record<number, Target>>({});
  const targetOf = (g: number, ps: ReviewPage[]): Target => targets[g] ?? { mode: "new", caseNo: suggested(g, ps) };

  function submit() {
    const plan = groups.map(([g, ps]) => {
      const t = targetOf(g, ps);
      return {
        pages: ps.map((p) => p.pageNo),
        case_id: t.mode === "existing" ? t.caseId || null : null,
        case_no: t.mode === "new" ? t.caseNo.trim() : null,
      };
    });
    start(async () => {
      const r = await confirmSplit(batchId, plan);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {groups.map(([g, ps]) => {
        const t = targetOf(g, ps);
        const borrower = ps.find((p) => p.borrower)?.borrower;
        return (
          <section key={g} className="glass-card fade-up p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  Group {g} · {ps.length} page{ps.length > 1 ? "s" : ""}
                </p>
                <p className="muted text-sm">
                  {ps.find((p) => p.last4) ? `Account …${ps.find((p) => p.last4)!.last4}` : "No account number read"}
                  {borrower ? ` · ${borrower}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  className="input-glass py-1"
                  value={t.mode}
                  onChange={(e) =>
                    setTargets({ ...targets, [g]: e.target.value === "new" ? { mode: "new", caseNo: suggested(g, ps) } : { mode: "existing", caseId: "" } })
                  }
                >
                  <option value="new">New case</option>
                  <option value="existing">Existing case</option>
                </select>
                {t.mode === "new" ? (
                  <input
                    className="input-glass py-1"
                    value={t.caseNo}
                    maxLength={40}
                    onChange={(e) => setTargets({ ...targets, [g]: { mode: "new", caseNo: e.target.value } })}
                  />
                ) : (
                  <select
                    className="input-glass py-1"
                    value={t.caseId}
                    onChange={(e) => setTargets({ ...targets, [g]: { mode: "existing", caseId: e.target.value } })}
                  >
                    <option value="">Choose case…</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.no}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="muted text-left text-xs">
                  <th className="py-1">Page</th>
                  <th className="py-1">Looks like</th>
                  <th className="py-1">Account</th>
                  <th className="py-1">Group</th>
                </tr>
              </thead>
              <tbody>
                {ps.map((p) => (
                  <tr key={p.pageNo} className="border-t border-white/20">
                    <td className="py-1.5">
                      {pdfUrl ? (
                        <a className="hover:underline" href={`${pdfUrl}#page=${p.pageNo}`} target="_blank" rel="noreferrer">
                          {p.pageNo} ↗
                        </a>
                      ) : (
                        p.pageNo
                      )}
                    </td>
                    <td className="py-1.5">
                      {CLASS_LABEL[p.cls] ?? p.cls}
                      {p.flags.includes("injection") ? (
                        <span className="pill pill-red ml-2" title="This page contains text addressed to an AI system. Check the scan; nothing from it is applied automatically.">
                          ⚠ instructions in page
                        </span>
                      ) : (
                        p.confidence != null && p.confidence < 0.6 && <span className="pill pill-amber ml-2">check</span>
                      )}
                      {p.flags.includes("hidden_text") && <span className="pill pill-amber ml-2">hidden text</span>}
                    </td>
                    <td className="py-1.5">{p.last4 ? `…${p.last4}` : "—"}</td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        min={1}
                        className="input-glass w-20 py-1"
                        value={groupOf[p.pageNo] ?? p.group}
                        onChange={(e) => setGroupOf({ ...groupOf, [p.pageNo]: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending} onClick={submit}>
          {pending ? "Confirming…" : `✦ Confirm split into ${groups.length} case${groups.length > 1 ? "s" : ""}`}
        </button>
        {result &&
          (result.ok ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
          ) : (
            <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
          ))}
      </div>
    </div>
  );
}

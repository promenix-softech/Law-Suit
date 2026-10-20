"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "./actions";
import { queueBundle, queueDraftPdf, queueExport } from "./job-actions";

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="fade-up text-xs text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
  ) : (
    <p className="fade-up text-xs text-red-600 dark:text-red-400">{result.error}</p>
  );
}

export function MakePdf({ caseId, versionId }: { caseId: string; versionId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn px-3 py-1 text-xs"
        disabled={pending}
        onClick={() => start(async () => setResult(await queueDraftPdf(caseId, versionId)))}
      >
        {pending ? "Queueing…" : "Make PDF/A"}
      </button>
      <Status result={result} />
    </span>
  );
}

export function ExportCase({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await queueExport(caseId);
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "Queueing…" : "⬇ Export case (ZIP)"}
      </button>
      <Status result={result} />
    </span>
  );
}

type Doc = { id: string; name: string };

/** Same marks the worker prints: A … Z, AA, AB, … */
function exhibitMark(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Pick case scans as annexures (in filing order) and queue the bundle. */
export function BundleForm({ caseId, documents }: { caseId: string; documents: Doc[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [picked, setPicked] = useState<{ document_id: string; title: string }[]>([]);

  const toggle = (id: string) =>
    setPicked((p) => (p.some((x) => x.document_id === id) ? p.filter((x) => x.document_id !== id) : [...p, { document_id: id, title: "" }]));
  const setTitle = (id: string, title: string) => setPicked((p) => p.map((x) => (x.document_id === id ? { ...x, title } : x)));

  return (
    <div className="space-y-3">
      {documents.length ? (
        <ul className="space-y-2">
          {documents.map((d) => {
            const i = picked.findIndex((x) => x.document_id === d.id);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={i >= 0} onChange={() => toggle(d.id)} />
                  <span className="max-w-56 truncate">{d.name}</span>
                </label>
                {i >= 0 && (
                  <>
                    <span className="pill pill-violet">Exhibit {exhibitMark(i)}</span>
                    <input
                      className="input-glass max-w-72 flex-1 py-1 text-sm"
                      placeholder="Title, e.g. Loan agreement dated …"
                      maxLength={120}
                      value={picked[i]!.title}
                      onChange={(e) => setTitle(d.id, e.target.value)}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted text-sm">No scans uploaded; the bundle will hold the pleadings only.</p>
      )}
      <button
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await queueBundle(caseId, picked);
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "Queueing…" : "✦ Prepare e-filing bundle"}
      </button>
      <Status result={result} />
    </div>
  );
}

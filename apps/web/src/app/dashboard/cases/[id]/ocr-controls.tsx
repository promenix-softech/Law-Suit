"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshOcr, startExtraction, startOcr } from "./ocr-actions";

export type Job = { id: string; status: string; pages_succeeded: number | null; error: string | null } | null;
type Msg = { ok: boolean; text: string } | null;

const POLL_MS = 5000;
const MAX_POLLS = 60; // ~5 minutes, then the user can refresh manually

/** While a job runs, asks the server to check Sarvam every few seconds. */
function usePoll(job: Job, onDone: (m: Msg) => void) {
  const router = useRouter();
  const running = job?.status === "running";
  const jobId = job?.id;
  useEffect(() => {
    if (!running || !jobId) return;
    let polls = 0;
    const t = setInterval(async () => {
      if (++polls > MAX_POLLS) return clearInterval(t);
      const r = await refreshOcr(jobId);
      if (r.done) {
        clearInterval(t);
        onDone(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
        router.refresh();
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [running, jobId, router, onDone]);
}

const Spinner = () => <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />;

function Message({ m }: { m: Msg }) {
  if (!m) return null;
  return <span className={`text-xs ${m.ok ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{m.text}</span>;
}

export function OcrControls({
  documentId,
  caseId,
  job,
  extractJob,
  canEdit,
}: {
  documentId: string;
  caseId: string;
  job: Job;
  extractJob: Job;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [language, setLanguage] = useState<"en-IN" | "mr-IN">("en-IN");
  const [msg, setMsg] = useState<Msg>(null);
  usePoll(job, setMsg);
  usePoll(extractJob, setMsg);

  const ocrRunning = job?.status === "running";
  const ocrDone = job && (job.status === "completed" || job.status === "partially_completed");
  const exRunning = extractJob?.status === "running";
  const failed = (j: Job) => j?.status === "failed" || j?.status === "rejected";

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ocrRunning && (
        <span className="pill pill-amber">
          <Spinner /> OCR running…
        </span>
      )}
      {exRunning && (
        <span className="pill pill-violet">
          <Spinner /> Extracting fields…
        </span>
      )}
      {ocrDone && (
        <Link href={`/dashboard/cases/${caseId}/documents/${documentId}`} className="btn px-3 py-1 text-xs">
          View text ({job.pages_succeeded ?? 0} pages)
        </Link>
      )}
      {failed(job) && (
        <span className="pill pill-red" title={job?.error ?? undefined}>
          OCR failed
        </span>
      )}
      {failed(extractJob) && (
        <span className="pill pill-red" title={extractJob?.error ?? undefined}>
          Extraction failed
        </span>
      )}
      {canEdit && !ocrRunning && (
        <>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as typeof language)}
            className="input-glass w-auto px-2 py-1 text-xs"
            aria-label="Document language"
          >
            <option value="en-IN">English</option>
            <option value="mr-IN">Marathi</option>
          </select>
          <button disabled={pending} onClick={() => run(() => startOcr({ documentId, language }))} className="btn px-3 py-1 text-xs">
            {ocrDone ? "Re-run OCR" : "Run OCR"}
          </button>
        </>
      )}
      {canEdit && !exRunning && (
        <button disabled={pending} onClick={() => run(() => startExtraction(documentId))} className="btn btn-primary px-3 py-1 text-xs">
          ✦ Extract fields
        </button>
      )}
      <Message m={msg} />
    </div>
  );
}

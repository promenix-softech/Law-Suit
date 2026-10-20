"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshOcr, startOcr } from "./ocr-actions";

type Job = { id: string; status: string; pages_succeeded: number | null; error: string | null } | null;

const POLL_MS = 5000;
const MAX_POLLS = 60; // ~5 minutes, then the user can refresh manually

export function OcrControls({ documentId, caseId, job, canEdit }: { documentId: string; caseId: string; job: Job; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [language, setLanguage] = useState<"en-IN" | "mr-IN">("en-IN");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const polls = useRef(0);

  const running = job?.status === "running";

  // While a job runs, ask the server to check Sarvam every few seconds.
  useEffect(() => {
    if (!running || !job) return;
    polls.current = 0;
    const t = setInterval(async () => {
      if (++polls.current > MAX_POLLS) return clearInterval(t);
      const r = await refreshOcr(job.id);
      if (r.done) {
        clearInterval(t);
        setMessage(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
        router.refresh();
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [running, job, router]);

  const done = job && (job.status === "completed" || job.status === "partially_completed");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {running && (
        <span className="pill pill-amber">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          OCR running…
        </span>
      )}
      {done && (
        <Link href={`/dashboard/cases/${caseId}/documents/${documentId}`} className="btn px-3 py-1 text-xs">
          ✦ View text ({job.pages_succeeded ?? 0} pages)
        </Link>
      )}
      {job?.status === "failed" || job?.status === "rejected" ? (
        <span className="pill pill-red" title={job.error ?? undefined}>
          OCR failed
        </span>
      ) : null}
      {canEdit && !running && (
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
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await startOcr({ documentId, language });
                setMessage(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
                router.refresh();
              })
            }
            className="btn btn-primary px-3 py-1 text-xs"
          >
            {pending ? "Starting…" : done ? "Re-run OCR" : "Run OCR"}
          </button>
        </>
      )}
      {message && <span className={`text-xs ${message.ok ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{message.text}</span>}
    </div>
  );
}

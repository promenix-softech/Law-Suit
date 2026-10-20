"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { decideDraft, generateDraft, recordUpload, submitForApproval, type ActionResult } from "./actions";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700";
const primary = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="text-sm text-green-700 dark:text-green-400">{result.message}</p>
  ) : (
    <p className="text-sm text-red-600">{result.error}</p>
  );
}

export function UploadScan({ orgId, caseId }: { orgId: string; caseId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function onUpload() {
    const file = input.current?.files?.[0];
    if (!file) return setResult({ ok: false, error: "Choose a file first." });
    if (!ALLOWED.includes(file.type)) return setResult({ ok: false, error: "Only PDF, JPG or PNG files." });
    if (file.size > MAX_BYTES) return setResult({ ok: false, error: "File is larger than 25 MB." });

    setBusy(true);
    setResult(null);
    try {
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
      const path = `${orgId}/${caseId}/scans/${Date.now()}-${safe}`;
      const { error } = await createClient().storage.from("case-files").upload(path, file, { contentType: file.type });
      if (error) return setResult({ ok: false, error: "Upload not allowed for this case." });
      setResult(await recordUpload({ caseId, path, sha256: await sha256Hex(file) }));
      if (input.current) input.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-sm" />
        <button onClick={onUpload} disabled={busy} className={btn}>
          {busy ? "Uploading…" : "Upload scan"}
        </button>
      </div>
      <Status result={result} />
    </div>
  );
}

export function GenerateDraft({ caseId, kind, label }: { caseId: string; kind: "demand_notice" | "plaint"; label: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-1">
      <button onClick={() => start(async () => setResult(await generateDraft(caseId, kind)))} disabled={pending} className={primary}>
        {pending ? "Generating…" : label}
      </button>
      <Status result={result} />
    </div>
  );
}

export function SubmitDraft({ draftId }: { draftId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button onClick={() => start(async () => setResult(await submitForApproval(draftId)))} disabled={pending} className={btn}>
        {pending ? "Sending…" : "Submit for approval"}
      </button>
      <Status result={result} />
    </span>
  );
}

export function DecideDraft({ draftId }: { draftId: string }) {
  const [pending, start] = useTransition();
  const [comments, setComments] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const decide = (decision: "approved" | "returned") =>
    start(async () => setResult(await decideDraft({ draftId, decision, comments: comments || undefined })));
  return (
    <div className="mt-2 space-y-2 rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        placeholder="Comments (required when returning)"
        rows={2}
        className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
      />
      <div className="flex gap-2">
        <button onClick={() => decide("approved")} disabled={pending} className={primary}>
          Approve
        </button>
        <button onClick={() => decide("returned")} disabled={pending} className={btn}>
          Return to drafter
        </button>
      </div>
      <Status result={result} />
    </div>
  );
}

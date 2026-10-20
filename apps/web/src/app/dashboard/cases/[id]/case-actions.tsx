"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateDemandNotice, recordUpload, type ActionResult } from "./actions";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

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
        <button
          onClick={onUpload}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
        >
          {busy ? "Uploading…" : "Upload scan"}
        </button>
      </div>
      <Status result={result} />
    </div>
  );
}

export function GenerateNotice({ caseId }: { caseId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      <button
        onClick={() => start(async () => setResult(await generateDemandNotice(caseId)))}
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Generating…" : "Generate demand notice (DOCX)"}
      </button>
      <Status result={result} />
    </div>
  );
}

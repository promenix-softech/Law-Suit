"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBatch, type ActionResult } from "./actions";

const MAX_BYTES = 50 * 1024 * 1024;

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Uploads one multi-case scan straight to the private case-batches bucket (admin-only RLS). */
export function UploadBatch({ orgId }: { orgId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function onUpload() {
    const file = input.current?.files?.[0];
    if (!file) return setResult({ ok: false, error: "Choose a PDF first." });
    if (file.type !== "application/pdf") return setResult({ ok: false, error: "Only PDF scans." });
    if (file.size > MAX_BYTES) return setResult({ ok: false, error: "File is larger than 50 MB; split it into parts." });
    setBusy(true);
    setResult(null);
    try {
      const id = crypto.randomUUID();
      // Fixed object name: bank scans are often named after the borrower or account.
      const path = `${orgId}/${id}/scan.pdf`;
      const { error } = await createClient().storage.from("case-batches").upload(path, file, { contentType: "application/pdf" });
      if (error) return setResult({ ok: false, error: "Upload not allowed." });
      setResult(await createBatch({ id, path, sha256: await sha256Hex(file) }));
      if (input.current) input.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="application/pdf" className="text-sm" />
        <button className="btn btn-primary" disabled={busy} onClick={onUpload}>
          {busy ? "Uploading…" : "⬆ Upload bulk scan"}
        </button>
      </div>
      {result &&
        (result.ok ? (
          <p className="fade-up text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
        ) : (
          <p className="fade-up text-sm text-red-600 dark:text-red-400">{result.error}</p>
        ))}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  decideDraft,
  generateDraft,
  recordMediationOutcome,
  recordNotice,
  recordUpload,
  startMediation,
  submitForApproval,
  type ActionResult,
} from "./actions";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function checkFile(file: File | undefined): string | null {
  if (!file) return "Choose a file first.";
  if (!ALLOWED.includes(file.type)) return "Only PDF, JPG or PNG files.";
  if (file.size > MAX_BYTES) return "File is larger than 25 MB.";
  return null;
}

/** Uploads straight to storage as the signed-in user; storage RLS decides if it is allowed. */
async function uploadToCase(orgId: string, caseId: string, folder: "scans" | "mediation", file: File) {
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const path = `${orgId}/${caseId}/${folder}/${Date.now()}-${safe}`;
  const { error } = await createClient().storage.from("case-files").upload(path, file, { contentType: file.type });
  return error ? null : path;
}

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="fade-up text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
  ) : (
    <p className="fade-up text-sm text-red-600 dark:text-red-400">{result.error}</p>
  );
}

export function UploadScan({ orgId, caseId }: { orgId: string; caseId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function onUpload() {
    const file = input.current?.files?.[0];
    const bad = checkFile(file);
    if (bad || !file) return setResult({ ok: false, error: bad ?? "Choose a file first." });
    setBusy(true);
    setResult(null);
    try {
      const path = await uploadToCase(orgId, caseId, "scans", file);
      if (!path) return setResult({ ok: false, error: "Upload not allowed for this case." });
      setResult(await recordUpload({ caseId, path, sha256: await sha256Hex(file) }));
      if (input.current) input.current.value = "";
      setName(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn cursor-pointer">
          <input
            ref={input}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
          />
          {name ? `📄 ${name.slice(0, 28)}` : "Choose scan…"}
        </label>
        <button onClick={onUpload} disabled={busy || !name} className="btn btn-primary">
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      <Status result={result} />
    </div>
  );
}

export function GenerateDraft({
  caseId,
  kind,
  label,
}: {
  caseId: string;
  kind: "demand_notice" | "plaint" | "vakalatnama" | "affidavit";
  label: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-1">
      <button onClick={() => start(async () => setResult(await generateDraft(caseId, kind)))} disabled={pending} className="btn btn-primary">
        {pending ? "Generating…" : `✦ ${label}`}
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
      <button onClick={() => start(async () => setResult(await submitForApproval(draftId)))} disabled={pending} className="btn">
        {pending ? "Sending…" : "Submit for approval →"}
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
    <div className="mt-3 space-y-2">
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        placeholder="Comments (required when returning)"
        rows={2}
        className="input-glass"
      />
      <div className="flex gap-2">
        <button onClick={() => decide("approved")} disabled={pending} className="btn btn-primary">
          Approve
        </button>
        <button onClick={() => decide("returned")} disabled={pending} className="btn">
          Return to drafter
        </button>
      </div>
      <Status result={result} />
    </div>
  );
}

export function NoticeForm({ caseId }: { caseId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [mode, setMode] = useState<"rpad" | "speed_post" | "email" | "hand">("rpad");
  const [trackingNo, setTrackingNo] = useState("");
  const [sentOn, setSentOn] = useState(todayIST());
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="input-glass mt-1">
            <option value="rpad">RPAD</option>
            <option value="speed_post">Speed Post</option>
            <option value="email">Email</option>
            <option value="hand">By hand</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Tracking no.</span>
          <input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} className="input-glass mt-1" placeholder="Optional" />
        </label>
        <label className="block">
          <span className="label">Sent on</span>
          <input type="date" value={sentOn} max={todayIST()} onChange={(e) => setSentOn(e.target.value)} className="input-glass mt-1" />
        </label>
      </div>
      <button
        onClick={() => start(async () => setResult(await recordNotice({ caseId, mode, trackingNo: trackingNo || undefined, sentOn })))}
        disabled={pending}
        className="btn btn-primary"
      >
        {pending ? "Saving…" : "Record dispatch"}
      </button>
      <Status result={result} />
    </div>
  );
}

export function MediationStart({ caseId }: { caseId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [authority, setAuthority] = useState("District Legal Services Authority");
  const [appliedOn, setAppliedOn] = useState(todayIST());
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Mediation authority</span>
          <input value={authority} onChange={(e) => setAuthority(e.target.value)} className="input-glass mt-1" />
        </label>
        <label className="block">
          <span className="label">Applied on</span>
          <input type="date" value={appliedOn} max={todayIST()} onChange={(e) => setAppliedOn(e.target.value)} className="input-glass mt-1" />
        </label>
      </div>
      <button onClick={() => start(async () => setResult(await startMediation({ caseId, authority, appliedOn })))} disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Record 12A application"}
      </button>
      <Status result={result} />
    </div>
  );
}

export function MediationOutcome({ orgId, caseId, mediationId }: { orgId: string; caseId: string; mediationId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [outcome, setOutcome] = useState<"failed" | "non_starter" | "settled">("non_starter");
  const [reportDate, setReportDate] = useState(todayIST());
  const [name, setName] = useState<string | null>(null);

  async function onSave() {
    const file = input.current?.files?.[0];
    const bad = checkFile(file);
    if (bad || !file) return setResult({ ok: false, error: bad ?? "Attach the mediator's report." });
    setBusy(true);
    setResult(null);
    try {
      const reportPath = await uploadToCase(orgId, caseId, "mediation", file);
      if (!reportPath) return setResult({ ok: false, error: "Upload not allowed for this case." });
      setResult(await recordMediationOutcome({ caseId, mediationId, outcome, reportDate, reportPath }));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Outcome</span>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className="input-glass mt-1">
            <option value="non_starter">Non-starter</option>
            <option value="failed">Failed</option>
            <option value="settled">Settled</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Report date</span>
          <input type="date" value={reportDate} max={todayIST()} onChange={(e) => setReportDate(e.target.value)} className="input-glass mt-1" />
        </label>
        <div>
          <span className="label">Mediator&apos;s report</span>
          <label className="btn mt-1 w-full cursor-pointer">
            <input
              ref={input}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="sr-only"
              onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
            />
            {name ? `📄 ${name.slice(0, 20)}` : "Attach…"}
          </label>
        </div>
      </div>
      <button onClick={onSave} disabled={busy} className="btn btn-primary">
        {busy ? "Saving…" : "Record outcome"}
      </button>
      <Status result={result} />
    </div>
  );
}

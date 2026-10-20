"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createTask, updateTask, type ActionResult } from "./actions";

const KINDS = [
  ["collect_docs", "Collect documents"],
  ["notary", "Notary / stamp"],
  ["efile", "E-filing"],
  ["dispatch_notice", "Dispatch notice"],
] as const;

function Status({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
  ) : (
    <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
  );
}

/** Case page: assign a field task. */
export function AssignTask({ caseId, fieldStaff }: { caseId: string; fieldStaff: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("collect_docs");
  const [assigneeId, setAssignee] = useState(fieldStaff[0]?.id ?? "");
  const [dueOn, setDue] = useState("");
  const [instructions, setInstructions] = useState("");

  if (!fieldStaff.length) return <p className="muted text-sm">No field staff in this office yet.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="input-glass py-1.5" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select className="input-glass py-1.5" value={assigneeId} onChange={(e) => setAssignee(e.target.value)}>
          {fieldStaff.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="date" className="input-glass py-1.5" value={dueOn} onChange={(e) => setDue(e.target.value)} />
      </div>
      <input
        className="input-glass w-full py-1.5 text-sm"
        placeholder="Instructions (no account numbers or PAN)"
        maxLength={500}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
      />
      <button
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createTask({ caseId, assigneeId, kind, dueOn: dueOn || undefined, instructions: instructions || undefined });
            setResult(r);
            if (r.ok) {
              setInstructions("");
              router.refresh();
            }
          })
        }
      >
        {pending ? "Assigning…" : "＋ Assign task"}
      </button>
      <Status result={result} />
    </div>
  );
}

/** Field view: start / finish a task with a note and an optional photo (camera on phones). */
export function TaskProgress({ taskId, orgId, caseId, status }: { taskId: string; orgId: string; caseId: string; status: string }) {
  const router = useRouter();
  const photo = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);

  async function finish() {
    let proofPath: string | undefined;
    const file = photo.current?.files?.[0];
    if (file) {
      if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type) || file.size > 25 * 1024 * 1024) {
        return setResult({ ok: false, error: "Photo must be JPG/PNG/PDF under 25 MB." });
      }
      const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
      proofPath = `${orgId}/${caseId}/field/${Date.now()}-${taskId.slice(0, 8)}.${ext}`;
      const { error } = await createClient().storage.from("case-files").upload(proofPath, file, { contentType: file.type });
      if (error) return setResult({ ok: false, error: "Photo upload was not allowed." });
    }
    const r = await updateTask({ taskId, status: "done", note: note || undefined, proofPath });
    setResult(r);
    if (r.ok) router.refresh();
  }

  return (
    <div className="mt-3 space-y-2">
      {status === "open" && (
        <button className="btn w-full" disabled={pending} onClick={() => start(async () => setResult(await updateTask({ taskId, status: "in_progress" })))}>
          ▶ Start
        </button>
      )}
      <textarea
        className="input-glass w-full text-sm"
        rows={2}
        maxLength={500}
        placeholder="Note (e.g. notarised at Pune court, receipt no.)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <input ref={photo} type="file" accept="image/*,application/pdf" capture="environment" className="w-full text-sm" />
      <button className="btn btn-primary w-full" disabled={pending} onClick={() => start(finish)}>
        {pending ? "Saving…" : "✓ Mark done"}
      </button>
      <Status result={result} />
    </div>
  );
}

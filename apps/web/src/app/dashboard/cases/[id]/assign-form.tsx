"use client";

import { useState, useTransition } from "react";
import { assignCase } from "../../admin-actions";

type Person = { id: string; name: string };

export function AssignForm({
  caseId,
  drafterId,
  approverId,
  drafters,
  approvers,
}: {
  caseId: string;
  drafterId: string | null;
  approverId: string | null;
  drafters: Person[];
  approvers: Person[];
}) {
  const [drafter, setDrafter] = useState(drafterId ?? "");
  const [approver, setApprover] = useState(approverId ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clash = drafter && drafter === approver;
  const changed = drafter !== (drafterId ?? "") || approver !== (approverId ?? "");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Drafter</span>
          <select value={drafter} onChange={(e) => setDrafter(e.target.value)} className="input-glass mt-1">
            <option value="" disabled>
              Choose…
            </option>
            {drafters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Approver</span>
          <select value={approver} onChange={(e) => setApprover(e.target.value)} className="input-glass mt-1">
            <option value="" disabled>
              Choose…
            </option>
            {approvers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {clash && <p className="text-sm text-red-600 dark:text-red-400">Drafter and approver must be different people.</p>}
      <div className="flex items-center gap-3">
        <button
          disabled={pending || !changed || !drafter || !approver || !!clash}
          onClick={() =>
            start(async () => {
              const r = await assignCase({ caseId, drafterId: drafter, approverId: approver });
              setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            })
          }
          className="btn btn-primary"
        >
          {pending ? "Saving…" : "Save assignment"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

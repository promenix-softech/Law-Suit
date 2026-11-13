"use client";

import { useActionState, useState } from "react";
import type { BankClaimForum, CourtOption } from "@civil-suits/domain";
import { createCase, type FormState } from "../../admin-actions";
import { CourtPicker } from "./court-picker";

type Opt = { id: string; label: string };
type Person = { id: string; name: string };

function Select({ name, label, options, value, onChange }: { name: string; label: string; options: Opt[]; value?: string; onChange?: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select
        name={name}
        required
        className="input-glass mt-2"
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue: "" })}
      >
        <option value="" disabled>
          Choose…
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NewCaseForm({
  suggestedNo,
  branches,
  courts,
  drafters,
  approvers,
  officeForum,
}: {
  suggestedNo: string;
  branches: Opt[];
  courts: CourtOption[];
  drafters: Person[];
  approvers: Person[];
  officeForum: BankClaimForum;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCase, {});
  const [drafter, setDrafter] = useState("");
  const [approver, setApprover] = useState("");
  const [courtId, setCourtId] = useState("");
  const [urgent, setUrgent] = useState(false);
  const clash = drafter && drafter === approver;

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="label">Internal case no.</span>
          <input name="caseNo" defaultValue={suggestedNo} required className="input-glass mt-2" />
        </label>
        <label className="flex items-end gap-2 pb-2.5 text-sm">
          <input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="accent-violet-500" /> Urgent interim relief (no 12A mediation)
        </label>
        <Select name="branchId" label="Bank branch" options={branches} />
      </div>
      {/* The amount is not known yet: every court of the district, Pune by default. */}
      <CourtPicker courts={courts} claimPaise={null} urgent={urgent} officeForum={officeForum} value={courtId} onChange={setCourtId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="label">Borrower name</span>
          <input name="borrowerName" required className="input-glass mt-2" placeholder="As in the bank's records" />
        </label>
        <label className="block">
          <span className="label">Facility (optional)</span>
          <input name="facilityType" className="input-glass mt-2" placeholder="e.g. Term Loan" />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Borrower address (optional)</span>
          <input name="borrowerAddress" className="input-glass mt-2" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Select name="drafterId" label="Drafter" options={drafters.map((p) => ({ id: p.id, label: p.name }))} value={drafter} onChange={setDrafter} />
        <Select name="approverId" label="Approver" options={approvers.map((p) => ({ id: p.id, label: p.name }))} value={approver} onChange={setApprover} />
      </div>
      {clash && <p className="text-sm text-red-600 dark:text-red-400">Drafter and approver must be different people (maker–checker).</p>}

      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <div className="flex justify-end">
        <button disabled={pending || !!clash} className="btn btn-primary px-6 py-3">
          {pending ? "Opening…" : "Open case"}
        </button>
      </div>
      <p className="muted text-xs">Use synthetic data in the demo. Loan details come later from the scans, after the drafter verifies them.</p>
    </form>
  );
}

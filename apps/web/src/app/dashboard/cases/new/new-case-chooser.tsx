"use client";

import { useState } from "react";
import type { BankClaimForum, CourtOption } from "@civil-suits/domain";
import { IntakeFlow, type BranchOption } from "./intake-flow";
import { NewCaseForm } from "./new-case-form";

type Person = { id: string; name: string };

/** Two ways to open a case: from the bank's file (the AI fills the form), or typed in. */
export function NewCaseChooser(props: {
  orgId: string;
  userId: string;
  suggestedNo: string;
  branches: BranchOption[];
  courts: CourtOption[];
  drafters: Person[];
  approvers: Person[];
  officeForum: BankClaimForum;
}) {
  const [mode, setMode] = useState<"choose" | "file" | "typed">("choose");

  if (mode === "file") return <IntakeFlow {...props} onTypeInstead={() => setMode("typed")} />;
  if (mode === "typed") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setMode("file")} className="muted text-sm hover:underline">
          ← Use the bank&apos;s file instead (the AI fills the form)
        </button>
        <NewCaseForm
          suggestedNo={props.suggestedNo}
          branches={props.branches.map((b) => ({ id: b.id, label: b.label }))}
          courts={props.courts}
          drafters={props.drafters}
          approvers={props.approvers}
          officeForum={props.officeForum}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => setMode("file")}
        className="glass-card rounded-2xl border-2 border-violet-400/60 p-6 text-left transition hover:border-violet-500"
      >
        <span className="text-3xl">✦</span>
        <span className="mt-3 block text-lg font-semibold">From the bank&apos;s file</span>
        <span className="muted mt-1 block text-sm">Upload the loan file. The AI fills the form; you check it and open the case.</span>
        <span className="pill pill-green mt-3 inline-block text-xs">Recommended</span>
      </button>
      <button type="button" onClick={() => setMode("typed")} className="glass-card rounded-2xl p-6 text-left transition hover:border-violet-400">
        <span className="text-3xl">⌨</span>
        <span className="mt-3 block text-lg font-semibold">Type it in</span>
        <span className="muted mt-1 block text-sm">Case number, branch, court, borrower and team. Add the file later from the case page.</span>
      </button>
    </div>
  );
}

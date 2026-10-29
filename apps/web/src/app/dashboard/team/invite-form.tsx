"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../cases/[id]/actions";
import { inviteUser } from "./actions";

type Role = "admin" | "drafter" | "approver" | "field";

/** Admin types a name, an email and the roles; the person gets an email to set their own password. */
export function InviteForm({ labels }: { labels: Record<Role | "name" | "email" | "send" | "sending" | "roles", string> }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>(["drafter"]);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const toggle = (r: Role) => setRoles((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">{labels.name}</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-glass mt-1" autoComplete="off" />
        </label>
        <label className="block">
          <span className="label">{labels.email}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-glass mt-1" autoComplete="off" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">{labels.roles}</span>
        {(["drafter", "approver", "field", "admin"] as const).map((r) => (
          <button key={r} type="button" aria-pressed={roles.includes(r)} onClick={() => toggle(r)} className={`btn px-3 py-1 text-xs ${roles.includes(r) ? "btn-primary" : ""}`}>
            {roles.includes(r) ? "✓ " : "＋ "}
            {labels[r]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || !email || !fullName || !roles.length}
          className="btn btn-primary"
          onClick={() =>
            start(async () => {
              const r = await inviteUser({ email, fullName, roles });
              setResult(r);
              if (r.ok) {
                setEmail("");
                setFullName("");
                setRoles(["drafter"]);
              }
            })
          }
        >
          {pending ? labels.sending : `✉ ${labels.send}`}
        </button>
        {result &&
          (result.ok ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">✓ {result.message}</p>
          ) : (
            <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
          ))}
      </div>
    </div>
  );
}

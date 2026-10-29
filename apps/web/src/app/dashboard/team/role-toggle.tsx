"use client";

import { useState, useTransition } from "react";
import { setRole } from "./actions";

/** One role chip per user: tap to grant or remove. */
export function RoleToggle({ userId, role, label, on, locked }: { userId: string; role: "admin" | "drafter" | "approver" | "field"; label: string; on: boolean; locked?: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending || locked}
        title={locked ? "You cannot remove your own admin role" : undefined}
        aria-pressed={on}
        className={`btn px-3 py-1 text-xs ${on ? "btn-primary" : ""}`}
        onClick={() =>
          start(async () => {
            const r = await setRole({ userId, role, on: !on });
            setErr(r.ok ? null : r.error);
          })
        }
      >
        {pending ? "…" : `${on ? "✓ " : "＋ "}${label}`}
      </button>
      {err && <span className="mt-1 text-xs text-red-600 dark:text-red-400">{err}</span>}
    </span>
  );
}

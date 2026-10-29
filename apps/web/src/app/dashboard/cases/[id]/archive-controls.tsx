"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { translator, type Lang } from "@/lib/i18n";
import type { ActionResult } from "./actions";
import { archiveCase, restoreCase } from "./archive-actions";

export function ArchiveCase({ caseId, caseNo, lang }: { caseId: string; caseNo: string; lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  if (!open) {
    return (
      <button type="button" className="btn px-4 py-2 text-sm text-red-700 dark:text-red-300" onClick={() => setOpen(true)}>
        🗄 {t("Archive this case")}
      </button>
    );
  }
  return (
    <div className="fade-up space-y-3">
      <p className="text-sm">
        {t("Archiving hides")} <span className="font-semibold">{caseNo}</span>{" "}
        {t("from every list and makes it read-only. Nothing is deleted; an admin can restore it any time.")}
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        autoFocus
        placeholder={t("Reason (e.g. opened twice by mistake, bank withdrew the matter)")}
        className="input-glass"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || reason.trim().length < 3}
          className="btn bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const r = await archiveCase({ caseId, reason });
              setResult(r);
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? `${t("Archiving")}…` : t("Archive case")}
        </button>
        <button type="button" className="btn px-4 py-2 text-sm" onClick={() => setOpen(false)}>
          {t("Cancel")}
        </button>
      </div>
      {result && !result.ok && <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>}
    </div>
  );
}

export function RestoreCase({ caseId, lang }: { caseId: string; lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className="btn btn-primary px-4 py-2 text-sm"
        onClick={() =>
          start(async () => {
            const r = await restoreCase(caseId);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {pending ? `${t("Restoring")}…` : `↺ ${t("Restore case")}`}
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}

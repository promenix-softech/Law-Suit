"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { translator, type Lang } from "@/lib/i18n";
import { decideDraft } from "../cases/[id]/actions";

/**
 * Approve, or send back with the reason, without leaving the approvals page. The database decides
 * whether the approval is allowed (maker–checker); this only asks.
 */
export function InboxDecision({ draftId, paper, lang }: { draftId: string; paper: string; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [returning, setReturning] = useState(false);
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decide = (decision: "approved" | "returned") =>
    start(async () => {
      setError(null);
      const r = await decideDraft({ draftId, decision, comments: comments.trim() || undefined });
      if (!r.ok) return setError(r.error);
      router.refresh();
    });

  if (!returning) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => decide("approved")} disabled={pending} className="btn btn-primary px-3 py-1 text-xs" aria-label={`${t("Approve")}: ${paper}`}>
          ✓ {pending ? t("Saving…") : t("Approve")}
        </button>
        <button type="button" onClick={() => setReturning(true)} disabled={pending} className="btn px-3 py-1 text-xs" aria-label={`${t("Send back")}: ${paper}`}>
          ↩ {t("Send back")}
        </button>
        {error && <span className="text-xs text-red-600 dark:text-red-400">{t(error)}</span>}
      </div>
    );
  }
  return (
    <div className="w-full space-y-2">
      <label className="block">
        <span className="label">{t("What should the drafter fix?")}</span>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={2}
          maxLength={2000}
          autoFocus
          className="input-glass mt-1"
          aria-label={`${t("What should the drafter fix?")} ${paper}`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => decide("returned")} disabled={pending || !comments.trim()} className="btn btn-primary px-3 py-1 text-xs">
          ↩ {pending ? t("Saving…") : t("Send back to the drafter")}
        </button>
        <button type="button" onClick={() => setReturning(false)} disabled={pending} className="btn px-3 py-1 text-xs">
          {t("Cancel")}
        </button>
        {error && <span className="text-xs text-red-600 dark:text-red-400">{t(error)}</span>}
      </div>
    </div>
  );
}

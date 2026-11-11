"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setViewMode } from "@/app/view-actions";
import { translator, type Lang } from "@/lib/i18n";

/** Simple ⇄ full view; the choice is kept in a cookie. */
export function ViewToggle({ mode, lang }: { mode: "simple" | "full"; lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = mode === "simple" ? "full" : "simple";
  return (
    <button
      type="button"
      className="btn px-3 py-1.5 text-xs"
      disabled={pending}
      aria-pressed={mode === "full"}
      onClick={() =>
        start(async () => {
          await setViewMode(next);
          router.refresh();
        })
      }
    >
      {mode === "simple" ? `☰ ${t("Show everything")}` : `◻ ${t("Simple view")}`}
    </button>
  );
}

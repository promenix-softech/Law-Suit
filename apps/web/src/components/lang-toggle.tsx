"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLanguage } from "@/app/lang-actions";
import type { Lang } from "@/lib/i18n";

/** One-tap English ⇄ मराठी switch; the choice is kept in a cookie. */
export function LangToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next: Lang = lang === "mr" ? "en" : "mr";
  return (
    <button
      type="button"
      className="btn px-3 py-1.5 text-xs"
      disabled={pending}
      lang={next}
      aria-label={next === "mr" ? "मराठीत बदला" : "Switch to English"}
      onClick={() =>
        start(async () => {
          await setLanguage(next);
          router.refresh();
        })
      }
    >
      {next === "mr" ? "मराठी" : "English"}
    </button>
  );
}

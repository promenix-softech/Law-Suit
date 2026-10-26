import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { getT } from "@/lib/lang";
import { CommandPalette } from "./command-palette";
import { LangToggle } from "./lang-toggle";

export async function TopBar({ org, name, roles }: { org?: string | null; name?: string | null; roles: string[] }) {
  const { lang, t } = await getT();
  const initials = (name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <header className="sticky top-3 z-20 mx-auto w-full max-w-6xl px-4">
      <nav className="nav-glass flex items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-lg shadow-violet-500/30">
            CS
          </span>
          <span className="hidden font-semibold sm:inline">{org ?? "Civil Suits"}</span>
        </Link>
        <div className="flex items-center gap-3">
          <CommandPalette lang={lang} roles={roles} />
          {roles.includes("admin") && (
            <div className="flex items-center gap-1.5">
              <Link href="/dashboard/cases/new" className="btn btn-primary px-3 py-1.5 text-xs">
                {t("+ New case")}
              </Link>
              <Link href="/dashboard/audit" className="btn hidden px-3 py-1.5 text-xs lg:inline-flex">
                {t("Audit log")}
              </Link>
              <Link href="/dashboard/batches" className="btn hidden px-3 py-1.5 text-xs lg:inline-flex">
                {t("Bulk upload")}
              </Link>
              <Link href="/dashboard/billing" className="btn hidden px-3 py-1.5 text-xs lg:inline-flex">
                {t("Billing")}
              </Link>
              <Link href="/dashboard/settings" className="btn hidden px-3 py-1.5 text-xs lg:inline-flex">
                {t("Office settings")}
              </Link>
            </div>
          )}
          <LangToggle lang={lang} />
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{name}</p>
            <p className="muted text-xs capitalize leading-tight">{roles.join(" · ") || t("no role")}</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/40 text-xs font-semibold ring-1 ring-white/50 dark:bg-white/10 dark:ring-white/10">
            {initials}
          </span>
          <form action={signOut}>
            <button className="btn px-3 py-1.5 text-xs">{t("Sign out")}</button>
          </form>
        </div>
      </nav>
    </header>
  );
}

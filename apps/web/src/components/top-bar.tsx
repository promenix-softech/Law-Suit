import Link from "next/link";
import { signOut } from "@/app/login/actions";

export function TopBar({ org, name, roles }: { org?: string | null; name?: string | null; roles: string[] }) {
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
          {roles.includes("admin") && (
            <div className="flex items-center gap-1.5">
              <Link href="/dashboard/cases/new" className="btn btn-primary px-3 py-1.5 text-xs">
                + New case
              </Link>
              <Link href="/dashboard/audit" className="btn hidden px-3 py-1.5 text-xs sm:inline-flex">
                Audit log
              </Link>
              <Link href="/dashboard/billing" className="btn hidden px-3 py-1.5 text-xs sm:inline-flex">
                Billing
              </Link>
            </div>
          )}
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{name}</p>
            <p className="muted text-xs capitalize leading-tight">{roles.join(" · ") || "no role"}</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/40 text-xs font-semibold ring-1 ring-white/50 dark:bg-white/10 dark:ring-white/10">
            {initials}
          </span>
          <form action={signOut}>
            <button className="btn px-3 py-1.5 text-xs">Sign out</button>
          </form>
        </div>
      </nav>
    </header>
  );
}

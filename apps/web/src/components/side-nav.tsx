"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; badge?: number; group: string };

/**
 * App navigation: a fixed left rail on wide screens, a scrollable strip under the top bar on
 * phones. Items are already filtered by role on the server; RLS still decides what each page shows.
 */
export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/dashboard" ? path === href : path === href || path.startsWith(`${href}/`));
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-5 overflow-y-auto px-3 py-5 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-lg shadow-violet-500/30">
            CS
          </span>
          <span className="font-semibold">Civil Suits</span>
        </Link>
        {groups.map((g) => (
          <nav key={g} className="space-y-1">
            <p className="label px-3">{g}</p>
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={active(i.href) ? "page" : undefined}
                  className={`side-link ${active(i.href) ? "side-link-active" : ""}`}
                >
                  <span aria-hidden className="w-5 text-center">
                    {i.icon}
                  </span>
                  <span className="flex-1">{i.label}</span>
                  {!!i.badge && <span className="pill pill-amber px-2 py-0 text-xs">{i.badge}</span>}
                </Link>
              ))}
          </nav>
        ))}
      </aside>

      <nav className="flex gap-2 overflow-x-auto px-4 pt-3 lg:hidden" aria-label="Sections">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={`btn shrink-0 px-3 py-1.5 text-xs ${active(i.href) ? "btn-primary" : ""}`}>
            {i.icon} {i.label}
            {!!i.badge && ` (${i.badge})`}
          </Link>
        ))}
      </nav>
    </>
  );
}

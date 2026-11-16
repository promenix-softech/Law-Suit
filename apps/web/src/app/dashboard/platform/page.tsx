import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Meter } from "@civil-suits/domain";
import { SchemePills } from "@/components/scheme-usage";
import { TopBar } from "@/components/top-bar";
import { getT } from "@/lib/lang";
import { isPlatformAdmin, loadOffices } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/ui";

export const metadata = { title: "Offices — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const BAR: Record<Meter["state"], string> = { ok: "bg-emerald-500", near: "bg-amber-500", over: "bg-red-500" };

/** "42 / 150" with a thin bar; just the number when there is no limit. */
function Mini({ m }: { m: Meter }) {
  return (
    <span className="block min-w-24">
      <span className="tabular-nums">
        {m.used.toLocaleString("en-IN")}
        {m.allowed != null && <span className="muted"> / {m.allowed.toLocaleString("en-IN")}</span>}
      </span>
      {m.allowed != null && (
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-current/10">
          <span className={`block h-full rounded-full ${BAR[m.state]}`} style={{ width: `${Math.min(m.pct ?? 0, 100)}%` }} />
        </span>
      )}
    </span>
  );
}

/**
 * The super admin's view of every office: its scheme, whether it is running, and how much of the
 * scheme it has used this month and this scheme year. Counts only — the database functions behind
 * this page return no case, party or paper of any office.
 */
export default async function PlatformPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  if (!(await isPlatformAdmin(supabase))) notFound();
  const { t } = await getT();

  const [{ data: profile }, { data: roles }, offices] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    loadOffices(supabase),
  ]);
  if (!profile) redirect("/login");
  const roleNames = (roles ?? []).map((r) => r.role as string);

  const clients = offices.filter((o) => !o.isPlatform);
  const paused = clients.filter((o) => o.suspendedAt).length;
  const attention = clients.filter((o) => !o.suspendedAt && (o.status.attention || o.status.validity === "none")).length;
  const casesMonth = clients.reduce((n, o) => n + o.usage.casesMonth, 0);

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={roleNames} />
      <main className="w-full flex-1 space-y-6 px-4 pb-16 pt-8 lg:px-6">
        <div className="fade-up">
          <p className="label">{t("Super admin")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t("Offices")}</h1>
          <p className="muted mt-1 text-sm">{t("Each office's scheme and how much of it is used. You see numbers here, never an office's cases or papers.")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [t("Offices"), clients.length],
            [t("New cases this month, all offices"), casesMonth],
            [t("Need a look"), attention],
            [t("Paused"), paused],
          ].map(([label, value]) => (
            <div key={label as string} className="glass-card fade-up p-5">
              <p className="label">{label}</p>
              <p className="gradient-text mt-1 text-3xl font-semibold tracking-tight">{(value as number).toLocaleString("en-IN")}</p>
            </div>
          ))}
        </div>

        <section className="glass-card fade-up overflow-x-auto p-2">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="muted text-left text-xs">
                <th className="px-3 py-2 font-medium">{t("Office")}</th>
                <th className="px-3 py-2 font-medium">{t("Scheme")}</th>
                <th className="px-3 py-2 font-medium">{t("This month")}</th>
                <th className="px-3 py-2 font-medium">{t("This scheme year")}</th>
                <th className="px-3 py-2 font-medium">{t("People")}</th>
                <th className="px-3 py-2 font-medium">{t("Valid until")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-current/10">
              {offices.map((o) => (
                <tr key={o.id} className="row-hover" data-office={o.firmCode ?? o.id}>
                  <td className="px-3 py-3">
                    <Link href={`/dashboard/platform/${o.id}`} className="font-semibold hover:underline">
                      {o.name}
                    </Link>
                    <span className="muted block text-xs">
                      {o.firmCode ?? "—"}
                      {o.isPlatform && <> · {t("your own office")}</>}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <SchemePills office={o} t={t} />
                  </td>
                  <td className="px-3 py-3">
                    <Mini m={o.status.month} />
                  </td>
                  <td className="px-3 py-3">
                    <Mini m={o.status.year} />
                  </td>
                  <td className="px-3 py-3">
                    <Mini m={o.status.seats} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {o.terms?.validUntil ? fmtDate(o.terms.validUntil) : o.terms ? t("no end date") : "—"}
                    {o.status.daysLeft != null && o.status.validity !== "active" && (
                      <span className="muted block text-xs">
                        {o.status.daysLeft} {t("days left")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/dashboard/platform/${o.id}`} className="btn px-3 py-1 text-xs whitespace-nowrap">
                      {t("Open")} →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!offices.length && <p className="muted p-4 text-sm">{t("No offices yet.")}</p>}
        </section>
      </main>
    </>
  );
}

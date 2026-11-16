import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { SchemeMeters, SchemePills, UsageMonths } from "@/components/scheme-usage";
import { TopBar } from "@/components/top-bar";
import { getT } from "@/lib/lang";
import { isPlatformAdmin, loadMonthlyUsage, loadOffice } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/ui";
import { InviteAdminControl, SchemeForm, SuspendControl } from "./office-controls";

export const metadata = { title: "Office — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const BLOCKED: Record<string, string> = {
  not_started: "New cases are refused: the scheme has not started yet.",
  expired: "New cases are refused: the scheme has ended.",
  monthly: "New cases are refused: this month's allowance is used up.",
  yearly: "New cases are refused: this scheme year's allowance is used up.",
};

/** One office for the super admin: usage against its scheme, twelve months of usage, and the switches. */
export default async function PlatformOfficePage({ params, searchParams }: PageProps<"/dashboard/platform/[orgId]">) {
  const { orgId } = await params;
  const opened = (await searchParams).opened;
  if (!z.uuid().safeParse(orgId).success) notFound();
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  if (!(await isPlatformAdmin(supabase))) notFound();
  const { lang, t } = await getT();

  const [{ data: profile }, { data: roles }, office, months] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    loadOffice(supabase, orgId),
    loadMonthlyUsage(supabase, orgId, 12),
  ]);
  if (!profile) redirect("/login");
  if (!office) notFound();
  const roleNames = (roles ?? []).map((r) => r.role as string);

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 pb-16 pt-6">
        <div className="fade-up">
          <Link href="/dashboard/platform" className="muted text-sm hover:underline">
            ← {t("Offices")}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{office.name}</h1>
          <p className="muted mt-1 text-sm">
            {t("Firm code")}: {office.firmCode ?? "—"} · {t("Since")} {fmtDate(office.createdAt)}
          </p>
          <div className="mt-3">
            <SchemePills office={office} t={t} />
          </div>
          {opened === "1" && (
            <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm">{t("Office opened and its admin invited. Now set its scheme below.")}</p>
          )}
          {opened === "0" && (
            <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm">{t("Office opened, but the admin's invitation did not go. Invite the admin again below.")}</p>
          )}
          {office.status.blocked &&<p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm">{t(BLOCKED[office.status.blocked])}</p>}
          {!office.terms && !office.isPlatform && (
            <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm">{t("No scheme is set for this office yet: nothing is limited. Set one below.")}</p>
          )}
        </div>

        <section className="glass-card fade-up p-5">
          <h2 className="text-lg font-semibold">{t("Usage against the scheme")}</h2>
          <div className="mt-4">
            <SchemeMeters office={office} t={t} />
          </div>
        </section>

        <section className="glass-card fade-up p-5">
          <h2 className="text-lg font-semibold">{t("Usage, month by month")}</h2>
          <p className="muted mt-1 text-sm">{t("The last twelve months. A suit pack is counted once per case, when its first e-filing bundle is built.")}</p>
          <div className="mt-4">
            <UsageMonths months={months} t={t} />
          </div>
        </section>

        <section className="glass-card fade-up p-5">
          <h2 className="text-lg font-semibold">{t("Scheme")}</h2>
          {office.schemeUpdatedAt && (
            <p className="muted mt-1 text-xs">
              {t("Last changed")}: {fmtDate(office.schemeUpdatedAt)}
            </p>
          )}
          <div className="mt-4">
            <SchemeForm orgId={office.id} terms={office.terms} note={office.note} today={office.usage.today} lang={lang} />
          </div>
        </section>

        {!office.isPlatform && (
          <section className="glass-card fade-up p-5">
            <h2 className="text-lg font-semibold">{t("Office admin")}</h2>
            <p className="muted mt-1 text-sm">{t("The admin sets their own password from the email and adds the office's people. Invite again if the first email was lost.")}</p>
            <div className="mt-4">
              <InviteAdminControl orgId={office.id} lang={lang} />
            </div>
          </section>
        )}

        <section className="glass-card fade-up p-5">
          <h2 className="text-lg font-semibold">{t("Pause or resume")}</h2>
          <div className="mt-3">
            <SuspendControl orgId={office.id} suspendedAt={office.suspendedAt} reason={office.suspendedReason} isPlatform={office.isPlatform} lang={lang} />
          </div>
        </section>

        <p className="muted text-xs">{t("Every change here is written to the office's own audit log.")}</p>
      </main>
    </>
  );
}

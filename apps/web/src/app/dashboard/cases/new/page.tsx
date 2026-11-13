import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import type { CourtOption } from "@civil-suits/domain";
import { getT } from "@/lib/lang";
import { loadOfficeConfig } from "@/lib/office-profile";
import { peopleWithRole } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { NewCaseChooser } from "./new-case-chooser";

export const metadata = { title: "New case — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function NewCasePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: roles }, { data: branches }, { data: courts }, { count }, drafters, approvers, config] = await Promise.all([
    supabase.from("profiles").select("org_id, full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("bank_branches").select("id, branch_name, ifsc, banks(name, short_code)").order("branch_name"),
    supabase.from("courts").select("id, name, district, court_type").order("name"),
    supabase.from("cases").select("id", { count: "exact", head: true }),
    peopleWithRole(supabase, "drafter"),
    peopleWithRole(supabase, "approver"),
    loadOfficeConfig(supabase),
  ]);
  const { lang, t } = await getT();
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!roleNames.includes("admin")) redirect("/dashboard");

  const year = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 4);
  const suggestedNo = `CS-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  return (
    <>
      <TopBar org={one(profile?.organizations as Rel<{ name: string }>)?.name} name={profile?.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-8">
        <Link href="/dashboard" className="muted text-sm hover:underline">
          ← {t("Dashboard")}
        </Link>
        <h1 className="fade-up mt-2 text-3xl font-semibold tracking-tight">{t("Open a new case")}</h1>
        <p className="muted fade-up mt-1 text-sm">
          {t("Start from the bank's file and let the AI fill the form — or type it in.")}
        </p>
        <div className="glass-card fade-up mt-6 p-6 sm:p-8" style={{ animationDelay: "80ms" }}>
          <NewCaseChooser
            orgId={profile?.org_id as string}
            userId={auth.user.id}
            suggestedNo={suggestedNo}
            branches={(branches ?? []).map((b) => {
              const bank = one(b.banks as Rel<{ name: string; short_code: string }>);
              return {
                id: b.id,
                label: `${bank?.short_code ?? bank?.name ?? "Bank"} — ${b.branch_name}${b.ifsc ? ` (${b.ifsc})` : ""}`,
                ifsc: b.ifsc,
                name: b.branch_name,
              };
            })}
            courts={(courts ?? []).map((c): CourtOption => ({ id: c.id, name: c.name, district: c.district, courtType: c.court_type as CourtOption["courtType"] }))}
            drafters={drafters}
            approvers={approvers}
            officeForum={config?.settings.forum ?? "summary_suit"}
            lang={lang}
          />
        </div>
      </main>
    </>
  );
}

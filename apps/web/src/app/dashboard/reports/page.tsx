import Link from "next/link";
import { redirect } from "next/navigation";
import { formatINR } from "@civil-suits/domain";
import { z } from "zod";
import { TopBar } from "@/components/top-bar";
import { getT } from "@/lib/lang";
import { reportDate, reportTotals } from "@/lib/report";
import { loadReport } from "@/lib/report-data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reports — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Status report by bank: where every case stands, to read on screen or send to the bank as a sheet. */
export default async function ReportsPage({ searchParams }: PageProps<"/dashboard/reports">) {
  const sp = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { t } = await getT();

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!roleNames.some((r) => r === "admin" || r === "approver" || r === "drafter")) redirect("/dashboard/tasks");

  const bankId = typeof sp.bank === "string" && z.uuid().safeParse(sp.bank).success ? sp.bank : null;
  const { banks, rows } = await loadReport(supabase, bankId);
  const totals = reportTotals(rows);
  const csvHref = bankId ? `/dashboard/reports/export?bank=${bankId}` : "/dashboard/reports/export";

  return (
    <>
      <TopBar org={one(profile?.organizations as Rel<{ name: string }>)?.name} name={profile?.full_name} roles={roleNames} />
      <main className="w-full flex-1 space-y-5 px-4 pb-16 pt-8 lg:px-6">
        <div className="fade-up flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t("Status report")}</h1>
            <p className="muted mt-1 text-sm">{t("Where every case stands, bank by bank. Download it to send to the bank.")}</p>
          </div>
          {/* A plain link: the file is a download, not a page. */}
          <a href={csvHref} className="btn btn-primary ml-auto px-4 py-2 text-sm">
            ⬇ {t("Download for Excel")}
          </a>
        </div>

        <div className="fade-up flex flex-wrap gap-1.5">
          <Link href="/dashboard/reports" className={`btn px-3 py-1 text-xs ${bankId ? "" : "btn-primary"}`}>
            {t("All banks")}
          </Link>
          {banks.map((b) => (
            <Link key={b.id} href={`/dashboard/reports?bank=${b.id}`} className={`btn px-3 py-1 text-xs ${bankId === b.id ? "btn-primary" : ""}`}>
              {b.name}
            </Link>
          ))}
        </div>

        <dl className="fade-up grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            [t("Cases"), String(totals.cases)],
            [t("Total claim"), formatINR(totals.claimPaise)],
            [t("Filed"), String(totals.filed)],
            [t("Disposed"), String(totals.disposed)],
          ].map(([label, value]) => (
            <div key={label} className="glass-card p-5">
              <dt className="label">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="glass-card fade-up overflow-x-auto p-2">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="label">
                <th className="px-3 py-3 font-semibold">{t("Case")}</th>
                <th className="px-3 py-3 font-semibold">{t("Borrower")}</th>
                <th className="px-3 py-3 font-semibold">{t("Branch")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("Claim")}</th>
                <th className="px-3 py-3 font-semibold">{t("Stage")}</th>
                <th className="px-3 py-3 font-semibold">{t("Filed on")}</th>
                <th className="px-3 py-3 font-semibold">CNR</th>
                <th className="px-3 py-3 font-semibold">{t("Next hearing")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row-hover">
                  <td className="whitespace-nowrap rounded-l-xl px-3 py-2.5 font-semibold">
                    <Link href={`/dashboard/cases/${r.id}`} className="hover:underline">
                      {r.caseNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{r.borrower || "—"}</td>
                  <td className="px-3 py-2.5">
                    {r.branch || "—"}
                    {!bankId && r.bank && <span className="muted block text-xs">{r.bank}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">
                    {r.claimPaise == null ? "—" : formatINR(r.claimPaise)}
                  </td>
                  <td className="px-3 py-2.5">
                    {t(r.stage)}
                    {r.disposal && <span className="muted block text-xs">{t(r.disposal)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{reportDate(r.filedOn) || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs tracking-wider">{r.cnr ?? "—"}</td>
                  <td className="whitespace-nowrap rounded-r-xl px-3 py-2.5 tabular-nums">{reportDate(r.nextHearingOn) || "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="muted px-4 py-8 text-center">
                    {t("No cases in this view.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted text-xs">{t("The sheet has the same cases, and also the opening date, the notice date and the last 4 digits of the account number.")}</p>
      </main>
    </>
  );
}

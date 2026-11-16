import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatINR } from "@civil-suits/domain";
import { TopBar } from "@/components/top-bar";
import { getT } from "@/lib/lang";
import { isPlatformAdmin } from "@/lib/platform";
import { invoiceSummary, loadInvoices } from "@/lib/platform-billing";
import { createClient } from "@/lib/supabase/server";
import { InvoiceTable } from "../invoice-table";

export const metadata = { title: "Invoices — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Every office's invoices: what is unpaid, what was paid, and the switches. */
export default async function PlatformInvoicesPage({ searchParams }: PageProps<"/dashboard/platform/invoices">) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  if (!(await isPlatformAdmin(supabase))) notFound();
  const { lang, t } = await getT();
  const show = (await searchParams).show === "unpaid" ? "unpaid" : "all";

  const [{ data: profile }, { data: roles }, rows] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    loadInvoices(supabase, null),
  ]);
  if (!profile) redirect("/login");
  const sum = invoiceSummary(rows);
  const shown = show === "unpaid" ? rows.filter((r) => r.status === "issued") : rows;

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={(roles ?? []).map((r) => r.role as string)} />
      <main className="w-full flex-1 space-y-6 px-4 pb-16 pt-8 lg:px-6">
        <div className="fade-up">
          <p className="label">{t("Super admin")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t("Invoices")}</h1>
          <p className="muted mt-1 text-sm">{t("Issue an invoice from an office's page. Amounts and GST are worked out by the system; an issued invoice cannot be changed, only cancelled.")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [`${t("Unpaid")} (${sum.outstandingCount})`, sum.outstandingPaise],
            [`${t("Invoiced")} ${sum.fy}`, sum.invoicedThisFyPaise],
            [`${t("Paid")} ${sum.fy}`, sum.paidThisFyPaise],
          ].map(([label, value]) => (
            <div key={label as string} className="glass-card fade-up p-5">
              <p className="label">{label}</p>
              <p className="gradient-text mt-1 text-2xl font-semibold tracking-tight">{formatINR(value as number)}</p>
            </div>
          ))}
        </div>

        <section className="glass-card fade-up p-3">
          <div className="flex gap-2 p-2 text-sm">
            <Link href="/dashboard/platform/invoices" className={`btn px-3 py-1 text-xs ${show === "all" ? "btn-primary" : ""}`}>
              {t("All")}
            </Link>
            <Link href="/dashboard/platform/invoices?show=unpaid" className={`btn px-3 py-1 text-xs ${show === "unpaid" ? "btn-primary" : ""}`}>
              {t("Unpaid")}
            </Link>
          </div>
          <InvoiceTable rows={shown} showOffice t={t} lang={lang} />
        </section>
      </main>
    </>
  );
}

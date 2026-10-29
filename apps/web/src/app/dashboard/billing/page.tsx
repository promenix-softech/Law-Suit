import Link from "next/link";
import { redirect } from "next/navigation";
import { formatINR, gstSplit, monthlyCharge } from "@civil-suits/domain";
import { TopBar } from "@/components/top-bar";
import { istMonth, parseSlabs, SUPPLIER } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, title } from "@/lib/ui";

export const metadata = { title: "Billing — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const STATUS_TONE: Record<string, string> = { issued: "pill-amber", paid: "pill-green", cancelled: "pill-neutral" };

/** Admin-only: the office's plan, this month's running estimate and GST invoices. */
export default async function BillingPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("org_id, full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!roleNames.includes("admin") || !profile) redirect("/dashboard");

  const month = istMonth();
  const [{ data: plans }, { data: invoices }, { data: packs }] = await Promise.all([
    supabase.from("billing_plans").select("effective_from, slabs, minimum_paise, recipient_state").lte("effective_from", month.today).order("effective_from", { ascending: false }).limit(1),
    supabase.from("invoices").select("id, invoice_no, period_start, period_end, total_paise, status, issued_at").order("issued_at", { ascending: false }).limit(24),
    supabase.rpc("billable_suit_packs", { org: profile.org_id, p_start: month.start, p_end: month.end }),
  ]);
  const plan = plans?.[0];
  const slabs = plan ? parseSlabs(plan.slabs) : null;
  const suitPacks = Number(packs ?? 0);
  const estimate =
    plan && slabs ? monthlyCharge({ suitPacks, slabs, minimumPaise: Number(plan.minimum_paise) }) : null;
  const gst = estimate && plan ? gstSplit(estimate.taxablePaise, SUPPLIER.state, plan.recipient_state) : null;

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={roleNames} />
      <main className="w-full flex-1 lg:px-6 space-y-5 px-4 pb-16 pt-8">
        <div className="fade-up">
          <Link href="/dashboard" className="muted text-sm hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="muted mt-1 text-sm">One suit pack per case, counted when its first e-filing bundle is built. Amounts computed in code.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="glass-card fade-up p-6" style={{ animationDelay: "60ms" }}>
            <p className="label">This month · {fmtDate(month.start)} – {fmtDate(month.end)}</p>
            <p className="gradient-text mt-1 text-3xl font-semibold tracking-tight">{suitPacks} suit packs</p>
            {estimate && gst ? (
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="muted">Usage</dt><dd>{formatINR(estimate.usagePaise)}</dd></div>
                {estimate.minimumTopUpPaise > 0 && (
                  <div className="flex justify-between"><dt className="muted">Minimum top-up</dt><dd>{formatINR(estimate.minimumTopUpPaise)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="muted">GST 18%</dt><dd>{formatINR(gst.total)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Estimate</dt><dd>{formatINR(estimate.taxablePaise + gst.total)}</dd></div>
              </dl>
            ) : (
              <p className="muted mt-3 text-sm">No plan set up yet. Promenix sets the plan after the pilot agreement.</p>
            )}
          </div>

          <div className="glass-card fade-up p-6 md:col-span-2" style={{ animationDelay: "100ms" }}>
            <p className="label">Plan</p>
            {plan && slabs ? (
              <>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="muted text-left text-xs"><th className="py-1">Suit packs in the month</th><th className="py-1 text-right">Rate per pack</th></tr>
                  </thead>
                  <tbody>
                    {slabs.map((s, i) => (
                      <tr key={i} className="border-t border-white/20">
                        <td className="py-1.5">{i === 0 ? 1 : (slabs[i - 1]!.upTo ?? 0) + 1}{s.upTo ? ` – ${s.upTo}` : " and above"}</td>
                        <td className="py-1.5 text-right">{formatINR(s.ratePaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted mt-3 text-xs">
                  Monthly minimum {formatINR(Number(plan.minimum_paise))} · from {fmtDate(plan.effective_from)} · plus GST
                </p>
              </>
            ) : (
              <p className="muted mt-3 text-sm">—</p>
            )}
          </div>
        </div>

        <section className="glass-card fade-up p-6" style={{ animationDelay: "140ms" }}>
          <h2 className="text-lg font-semibold">Invoices</h2>
          {invoices?.length ? (
            <ul className="mt-4 divide-y divide-white/20">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span className="font-medium">{inv.invoice_no}</span>
                  <span className="muted">{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</span>
                  <span>{formatINR(Number(inv.total_paise))}</span>
                  <span className={`pill ${STATUS_TONE[inv.status] ?? "pill-neutral"}`}>{title(inv.status)}</span>
                  <a className="btn px-3 py-1 text-xs" href={`/dashboard/billing/invoices/${inv.id}`}>⬇ Invoice (DOCX)</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted mt-3 text-sm">No invoices yet.</p>
          )}
        </section>
      </main>
    </>
  );
}

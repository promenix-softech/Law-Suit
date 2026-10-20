import Link from "next/link";
import { redirect } from "next/navigation";
import { formatINR } from "@civil-suits/domain";
import { TopBar } from "@/components/top-bar";
import { createClient } from "@/lib/supabase/server";
import { caseStatus, title } from "@/lib/ui";

export const metadata = { title: "Dashboard — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function Stat({ label, value, hint, delay }: { label: string; value: number; hint: string; delay: number }) {
  return (
    <div className="glass-card fade-up p-5" style={{ animationDelay: `${delay}ms` }}>
      <p className="label">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="muted mt-1 text-xs">{hint}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // RLS decides which rows come back: admin/approver see all, drafter only assigned,
  // field only cases with their own tasks.
  const [{ data: profile }, { data: roles }, { data: cases }, { data: tasks }, { data: pending }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase
      .from("cases")
      .select("id, case_no_internal, status, suit_type, claim_amount_paise, is_commercial, needs_12a, parties(name, position)")
      .order("case_no_internal"),
    supabase
      .from("tasks")
      .select("id, kind, status, due_at, case_id, cases(case_no_internal)")
      .eq("assignee_id", auth.user.id),
    supabase
      .from("drafts")
      .select("id, doc_kind, created_by, updated_at, case_id, cases(case_no_internal)")
      .eq("status", "in_approval")
      .order("updated_at"),
  ]);

  const orgName = one(profile?.organizations as Rel<{ name: string }>)?.name;
  const roleNames = (roles ?? []).map((r) => r.role as string);
  const isApprover = roleNames.includes("approver");
  // Maker-checker: an approver's queue never shows their own drafts.
  const queue = (pending ?? []).filter((d) => d.created_by !== auth.user.id);
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <>
      <TopBar org={orgName} name={profile?.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8">
        <h1 className="fade-up text-3xl font-semibold tracking-tight">
          Good day{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="muted fade-up mt-1 text-sm">Here is where your cases stand.</p>

        <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Cases" value={cases?.length ?? 0} hint="Visible to you" delay={60} />
          <Stat label="Commercial" value={cases?.filter((c) => c.is_commercial).length ?? 0} hint="Sec 12A applies" delay={120} />
          <Stat label="Awaiting approval" value={isApprover ? queue.length : (pending?.length ?? 0)} hint={isApprover ? "In your queue" : "Across your cases"} delay={180} />
          <Stat label="My tasks" value={tasks?.length ?? 0} hint="Assigned to you" delay={240} />
        </section>

        {isApprover && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Awaiting my approval</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {queue.map((d) => (
                <Link key={d.id} href={`/dashboard/cases/${d.case_id}`} className="glass-card block p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{one(d.cases as Rel<{ case_no_internal: string }>)?.case_no_internal}</span>
                    <span className="pill pill-amber">Review</span>
                  </div>
                  <p className="muted mt-2 text-sm">{title(d.doc_kind)}</p>
                </Link>
              ))}
              {!queue.length && <p className="muted text-sm">Nothing waiting for approval.</p>}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Cases</h2>
          <div className="glass-card mt-3 overflow-x-auto p-2">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="label">
                  <th className="px-4 py-3 font-semibold">Case</th>
                  <th className="px-4 py-3 font-semibold">Borrower</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Claim</th>
                </tr>
              </thead>
              <tbody>
                {cases?.map((c) => {
                  const [label, tone] = caseStatus(c.status);
                  const borrower = [...(c.parties ?? [])].sort((a, b) => a.position - b.position)[0]?.name;
                  return (
                    <tr key={c.id} className="row-hover">
                      <td className="rounded-l-xl px-4 py-3">
                        <Link href={`/dashboard/cases/${c.id}`} className="font-semibold hover:underline">
                          {c.case_no_internal}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{borrower ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`pill ${tone}`}>{label}</span>
                      </td>
                      <td className="muted px-4 py-3">
                        {c.is_commercial ? "Commercial" : c.suit_type === "summary_o37" ? "Summary (O.37)" : "Ordinary"}
                      </td>
                      <td className="rounded-r-xl px-4 py-3 text-right font-medium tabular-nums">
                        {c.claim_amount_paise != null ? formatINR(Number(c.claim_amount_paise)) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {!cases?.length && (
                  <tr>
                    <td colSpan={5} className="muted px-4 py-8 text-center">
                      No cases visible to you.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">My tasks</h2>
            {!!tasks?.length && (
              <Link href="/dashboard/tasks" className="btn px-3 py-1 text-xs">
                Open task view →
              </Link>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks?.map((t) => (
              <Link key={t.id} href={`/dashboard/cases/${t.case_id}`} className="glass-card block p-4">
                <p className="font-semibold">{title(t.kind)}</p>
                <p className="muted mt-1 text-sm">
                  {one(t.cases as Rel<{ case_no_internal: string }>)?.case_no_internal} · {title(t.status)}
                </p>
              </Link>
            ))}
            {!tasks?.length && <p className="muted text-sm">No tasks assigned.</p>}
          </div>
        </section>
      </main>
    </>
  );
}

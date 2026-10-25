import Link from "next/link";
import { redirect } from "next/navigation";
import { caseDeadlines, daysBetween, formatINR, type CaseStatus, type DeadlineKind } from "@civil-suits/domain";
import { TopBar } from "@/components/top-bar";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { caseStatus, fmtDate, title, todayIST } from "@/lib/ui";

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

const DEADLINE_LABEL: Record<DeadlineKind | "task_overdue" | "task_today", string> = {
  limitation: "Limitation watch",
  mediation_12a: "12A mediation period ends",
  notice_period: "Notice period over — next step",
  approval: "Approval pending",
  task_overdue: "Task overdue",
  task_today: "Task due today",
};

type Alert = {
  key: string;
  kind: keyof typeof DEADLINE_LABEL;
  caseId: string;
  caseNo: string;
  due: string;
  daysLeft: number;
  tone: "red" | "amber";
  detail?: string;
};

const daysText = (d: number, t: T) => (d < 0 ? `${-d} ${t("days overdue")}` : d === 0 ? t("today") : `${d} ${t("days left")}`);

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { t } = await getT();

  // RLS decides which rows come back: admin/approver see all, drafter only assigned,
  // field only cases with their own tasks.
  const [{ data: profile }, { data: roles }, { data: cases }, { data: tasks }, { data: pending }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase
      .from("cases")
      .select(
        "id, case_no_internal, status, suit_type, claim_amount_paise, is_commercial, needs_12a, parties(name, position), loans(npa_date), notices(sent_at), mediations(applied_at, outcome)",
      )
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

  // Deadline watch: dates computed in packages/domain, never by hand.
  const today = todayIST();
  const istDate = (ts: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const oldestApproval = new Map<string, string>();
  (pending ?? []).forEach((d) => {
    const since = istDate(d.updated_at);
    if (!oldestApproval.has(d.case_id) || since < oldestApproval.get(d.case_id)!) oldestApproval.set(d.case_id, since);
  });
  const alerts: Alert[] = (cases ?? []).flatMap((c) => {
    const notice = (c.notices ?? []).map((n) => n.sent_at).filter(Boolean).sort().at(-1) ?? null;
    const mediation = (c.mediations ?? []).find((m) => m.outcome === "pending" || m.outcome == null);
    // One malformed date must not take the dashboard down.
    try {
      return caseDeadlines({
      today,
      status: c.status as CaseStatus,
      npaDate: one(c.loans as Rel<{ npa_date: string | null }>)?.npa_date ?? null,
      noticeSentOn: notice ? istDate(notice) : null,
      mediationAppliedOn: mediation?.applied_at ? mediation.applied_at.slice(0, 10) : null,
      approvalWaitingSince: oldestApproval.get(c.id) ?? null,
    }).map((d) => ({ ...d, key: `${c.id}:${d.kind}`, caseId: c.id, caseNo: c.case_no_internal }));
    } catch {
      return [];
    }
  });
  (tasks ?? []).forEach((tk) => {
    if (!tk.due_at || tk.status === "done" || tk.status === "cancelled") return;
    const due = istDate(tk.due_at);
    const daysLeft = daysBetween(today, due);
    if (daysLeft > 0) return;
    alerts.push({
      key: `task:${tk.id}`,
      kind: daysLeft < 0 ? "task_overdue" : "task_today",
      caseId: tk.case_id,
      caseNo: one(tk.cases as Rel<{ case_no_internal: string }>)?.case_no_internal ?? "",
      due,
      daysLeft,
      tone: daysLeft < 0 ? "red" : "amber",
      detail: title(tk.kind),
    });
  });
  alerts.sort((a, b) => (a.tone === b.tone ? a.daysLeft - b.daysLeft : a.tone === "red" ? -1 : 1));

  return (
    <>
      <TopBar org={orgName} name={profile?.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8">
        <h1 className="fade-up text-3xl font-semibold tracking-tight">
          {t("Good day")}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="muted fade-up mt-1 text-sm">{t("Here is where your cases stand.")}</p>

        <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label={t("Cases")} value={cases?.length ?? 0} hint={t("Visible to you")} delay={60} />
          <Stat label={t("Commercial")} value={cases?.filter((c) => c.is_commercial).length ?? 0} hint={t("Sec 12A applies")} delay={120} />
          <Stat
            label={t("Awaiting approval")}
            value={isApprover ? queue.length : (pending?.length ?? 0)}
            hint={isApprover ? t("In your queue") : t("Across your cases")}
            delay={180}
          />
          <Stat label={t("My tasks")} value={tasks?.length ?? 0} hint={t("Assigned to you")} delay={240} />
        </section>

        <section className="glass-card fade-up mt-8 p-5" style={{ animationDelay: "280ms" }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("Needs attention")}</h2>
            {!!alerts.length && <span className="pill pill-amber">{alerts.length}</span>}
          </div>
          {alerts.length ? (
            <ul className="mt-3 divide-y divide-current/5">
              {alerts.slice(0, 12).map((a) => (
                <li key={a.key}>
                  <Link href={`/dashboard/cases/${a.caseId}`} className="row-hover flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2.5">
                    <span className={`pill ${a.tone === "red" ? "pill-red" : "pill-amber"}`}>{daysText(a.daysLeft, t)}</span>
                    <span className="font-semibold">{a.caseNo}</span>
                    <span className="text-sm">
                      {t(DEADLINE_LABEL[a.kind])}
                      {a.detail && <span className="muted"> · {a.detail}</span>}
                    </span>
                    <span className="muted ml-auto text-xs tabular-nums">{fmtDate(a.due)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted mt-2 text-sm">{t("Nothing urgent. Limitation, 12A, notice and approval dates are all comfortable.")}</p>
          )}
          {alerts.some((a) => a.kind === "limitation") && (
            <p className="muted mt-3 text-xs">
              {t("Limitation watch = 3 years from NPA date − 90 days; advocate to confirm (acknowledgements extend it).")}
            </p>
          )}
        </section>

        {isApprover && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">{t("Awaiting my approval")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {queue.map((d) => (
                <Link key={d.id} href={`/dashboard/cases/${d.case_id}`} className="glass-card block p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{one(d.cases as Rel<{ case_no_internal: string }>)?.case_no_internal}</span>
                    <span className="pill pill-amber">{t("Review")}</span>
                  </div>
                  <p className="muted mt-2 text-sm">{title(d.doc_kind)}</p>
                </Link>
              ))}
              {!queue.length && <p className="muted text-sm">{t("Nothing waiting for approval.")}</p>}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("Cases")}</h2>
          <div className="glass-card mt-3 overflow-x-auto p-2">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="label">
                  <th className="px-4 py-3 font-semibold">{t("Case")}</th>
                  <th className="px-4 py-3 font-semibold">{t("Borrower")}</th>
                  <th className="px-4 py-3 font-semibold">{t("Status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("Type")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("Claim")}</th>
                </tr>
              </thead>
              <tbody>
                {cases?.map((c) => {
                  const [label, tone] = caseStatus(c.status, t);
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
                        {c.is_commercial ? t("Commercial") : c.suit_type === "summary_o37" ? t("Summary (O.37)") : t("Ordinary")}
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
                      {t("No cases visible to you.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("My tasks")}</h2>
            {!!tasks?.length && (
              <Link href="/dashboard/tasks" className="btn px-3 py-1 text-xs">
                {t("Open task view →")}
              </Link>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks?.map((tk) => (
              <Link key={tk.id} href={`/dashboard/cases/${tk.case_id}`} className="glass-card block p-4">
                <p className="font-semibold">{title(tk.kind)}</p>
                <p className="muted mt-1 text-sm">
                  {one(tk.cases as Rel<{ case_no_internal: string }>)?.case_no_internal} · {title(tk.status)}
                </p>
              </Link>
            ))}
            {!tasks?.length && <p className="muted text-sm">{t("No tasks assigned.")}</p>}
          </div>
        </section>
      </main>
    </>
  );
}

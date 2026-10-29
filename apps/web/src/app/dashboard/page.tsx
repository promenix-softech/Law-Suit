import Link from "next/link";
import { redirect } from "next/navigation";
import { caseDeadlines, daysBetween, formatINR, type CaseStatus, type DeadlineKind } from "@civil-suits/domain";
import { CountUp } from "@/components/count-up";
import { TopBar } from "@/components/top-bar";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { caseStatus, fmtDate, title, todayIST } from "@/lib/ui";

export const metadata = { title: "Dashboard — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function Stat({
  label,
  value,
  hint,
  delay,
  format = "number",
  href,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  delay: number;
  format?: "number" | "inr";
  href?: string;
  tone?: "red" | "amber";
}) {
  const body = (
    <>
      <p className="label">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${tone === "red" && value > 0 ? "text-red-600 dark:text-red-400" : tone === "amber" && value > 0 ? "text-amber-600 dark:text-amber-300" : ""}`}>
        <CountUp value={value} format={format} />
      </p>
      <p className="muted mt-1 text-xs">{hint}</p>
    </>
  );
  return href ? (
    <Link href={href} className="glass-card fade-up block p-5" style={{ animationDelay: `${delay}ms` }}>
      {body}
    </Link>
  ) : (
    <div className="glass-card fade-up p-5" style={{ animationDelay: `${delay}ms` }}>
      {body}
    </div>
  );
}

/** Where cases stand, in the stages an advocate's office thinks in. */
const STAGES = [
  { key: "intake", label: "Intake", statuses: ["bank_call", "case_created", "docs_uploaded", "extraction_review"], color: "bg-slate-400" },
  { key: "notice", label: "Notice", statuses: ["notice_generated", "notice_sent"], color: "bg-sky-500" },
  { key: "mediation", label: "12A", statuses: ["mediation_12a"], color: "bg-cyan-500" },
  { key: "drafting", label: "Drafting", statuses: ["drafting"], color: "bg-indigo-500" },
  { key: "approval", label: "Approval", statuses: ["in_approval"], color: "bg-violet-500" },
  { key: "filing", label: "Ready to file", statuses: ["approved", "notary_stamp", "efiling_ready"], color: "bg-amber-500" },
  { key: "court", label: "In court", statuses: ["filed", "listed", "disposed"], color: "bg-emerald-500" },
] as const;

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

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
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
        "id, case_no_internal, status, suit_type, claim_amount_paise, is_commercial, needs_12a, created_at, updated_at, archived_at, parties(name, position), loans(npa_date), notices(sent_at), mediations(applied_at, outcome)",
      )
      .order("case_no_internal"),
    supabase
      .from("tasks")
      .select("id, kind, status, due_at, case_id, cases(case_no_internal)")
      .eq("assignee_id", auth.user.id),
    supabase
      .from("drafts")
      .select("id, doc_kind, created_by, updated_at, case_id, cases!inner(case_no_internal, archived_at)")
      .eq("status", "in_approval")
      .is("cases.archived_at", null)
      .order("updated_at"),
  ]);

  const orgName = one(profile?.organizations as Rel<{ name: string }>)?.name;
  const roleNames = (roles ?? []).map((r) => r.role as string);
  // Field staff only work their tasks; the case file (parties, loans, drafts) is for drafters, approvers and admins.
  const fieldOnly = roleNames.length > 0 && roleNames.every((r) => r === "field");
  const isApprover = roleNames.includes("approver");
  // Maker-checker: an approver's queue never shows their own drafts.
  const queue = (pending ?? []).filter((d) => d.created_by !== auth.user.id);
  const firstName = profile?.full_name?.split(" ")[0];
  // Archived cases (admins only ever receive them) stay out of every count and alert.
  const active = (cases ?? []).filter((c) => !c.archived_at);
  const archivedCases = (cases ?? []).filter((c) => c.archived_at);

  // Deadline watch: dates computed in packages/domain, never by hand.
  const today = todayIST();
  const istDate = (ts: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const oldestApproval = new Map<string, string>();
  (pending ?? []).forEach((d) => {
    const since = istDate(d.updated_at);
    if (!oldestApproval.has(d.case_id) || since < oldestApproval.get(d.case_id)!) oldestApproval.set(d.case_id, since);
  });
  const alerts: Alert[] = active.flatMap((c) => {
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

  const isAdmin = roleNames.includes("admin");
  const approvalQueue = isApprover || isAdmin ? queue : [];
  const VIEWS: Record<string, string> = {
    all: t("All"),
    action: t("Needs action"),
    approval: t("In approval"),
    done: t("Approved / filed"),
    ...(isAdmin ? { archived: `🗄 ${t("Archived")} (${archivedCases.length})` } : {}),
  };
  const view = Object.keys(VIEWS).includes(String(sp.view)) ? String(sp.view) : "all";
  const stage = STAGES.find((s) => s.key === sp.stage);
  const DONE = new Set(["approved", "notary_stamp", "efiling_ready", "filed", "listed", "disposed"]);
  const alertCases = new Set(alerts.map((a) => a.caseId));
  const shown = (view === "archived" ? archivedCases : active).filter(
    (c) =>
      (!stage || (stage.statuses as readonly string[]).includes(c.status)) &&
      (view === "all" || view === "archived"
        ? true
        : view === "approval"
          ? c.status === "in_approval"
          : view === "done"
            ? DONE.has(c.status)
            : alertCases.has(c.id) || !DONE.has(c.status)),
  );
  const stageCounts = STAGES.map((s) => ({ ...s, n: active.filter((c) => (s.statuses as readonly string[]).includes(c.status)).length }));
  const claimInPipeline = active
    .filter((c) => !["filed", "listed", "disposed"].includes(c.status))
    .reduce((sum, c) => sum + Number(c.claim_amount_paise ?? 0), 0);
  const overdue = alerts.filter((a) => a.tone === "red").length;
  const ageDays = (ts: string) => Math.max(0, daysBetween(istDate(ts), today));

  return (
    <>
      <TopBar org={orgName} name={profile?.full_name} roles={roleNames} />
      <main className="w-full flex-1 px-4 pb-16 pt-8 lg:px-6">
        <h1 className="fade-up text-3xl font-semibold tracking-tight">
          {t("Good day")}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="muted fade-up mt-1 text-sm">{t("Here is where your cases stand.")}</p>

        <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label={t("Active cases")} value={active.length} hint={`${active.filter((c) => c.is_commercial).length} ${t("commercial (12A)")}`} delay={60} href="/dashboard#cases" />
          <Stat label={t("Claims in progress")} value={claimInPipeline} format="inr" hint={t("Not yet filed")} delay={110} />
          <Stat
            label={t("Awaiting approval")}
            value={isApprover || isAdmin ? queue.length : (pending?.length ?? 0)}
            hint={isApprover || isAdmin ? t("In your queue") : t("Across your cases")}
            delay={160}
            href="/dashboard?view=approval#cases"
            tone="amber"
          />
          <Stat label={t("Overdue")} value={overdue} hint={t("Deadlines or tasks past due")} delay={210} href="/dashboard?view=action#cases" tone="red" />
          <Stat label={t("My tasks")} value={tasks?.filter((tk) => tk.status !== "done" && tk.status !== "cancelled").length ?? 0} hint={t("Open, assigned to you")} delay={260} href="/dashboard/tasks" />
        </section>

        {/* Pipeline: every active case by stage; a click filters the list below */}
        {active.length > 0 && (
          <section className="glass-card fade-up mt-4 p-5" style={{ animationDelay: "300ms" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t("Pipeline")}</h2>
              {stage && (
                <Link href={view === "all" ? "/dashboard#cases" : `/dashboard?view=${view}#cases`} className="btn px-3 py-1 text-xs">
                  ✕ {t(stage.label)}
                </Link>
              )}
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-current/5">
              {stageCounts
                .filter((s) => s.n > 0)
                .map((s) => (
                  <Link
                    key={s.key}
                    href={`/dashboard?stage=${s.key}#cases`}
                    title={`${t(s.label)}: ${s.n}`}
                    className={`pipeline-seg h-full ${s.color} ${stage && stage.key !== s.key ? "opacity-30" : ""}`}
                    style={{ width: `${(s.n / active.length) * 100}%` }}
                  />
                ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {stageCounts.map((s) => (
                <Link
                  key={s.key}
                  href={`/dashboard?stage=${s.key}#cases`}
                  className={`row-hover flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${stage?.key === s.key ? "bg-current/5 font-semibold" : ""}`}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.color}`} />
                  <span className="truncate">{t(s.label)}</span>
                  <span className="muted ml-auto tabular-nums">{s.n}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Cases: every row opens the case */}
          <section id="cases">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t("Cases")}</h2>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(VIEWS).map((v) => (
                  <Link key={v} href={v === "all" ? "/dashboard#cases" : `/dashboard?view=${v}#cases`} className={`btn px-3 py-1 text-xs ${view === v ? "btn-primary" : ""}`}>
                    {VIEWS[v]}
                  </Link>
                ))}
              </div>
            </div>
            <div className="glass-card mt-3 overflow-x-auto p-2">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="label">
                    <th className="px-4 py-3 font-semibold">{t("Case")}</th>
                    <th className="px-4 py-3 font-semibold">{t("Borrower")}</th>
                    <th className="px-4 py-3 font-semibold">{t("Status")}</th>
                    <th className="px-4 py-3 font-semibold">{t("Type")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("Claim")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{view === "archived" ? t("Archived") : t("Age")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const [label, tone] = caseStatus(c.status, t);
                    const borrower = [...(c.parties ?? [])].sort((a, b) => a.position - b.position)[0]?.name;
                    const href = `/dashboard/cases/${c.id}`;
                    // Each cell is a full-size link, so a click anywhere on the row opens the case.
                    const cell = (content: React.ReactNode, cls = "") => (
                      <Link href={href} tabIndex={-1} className={`block px-4 py-3 ${cls}`}>
                        {content}
                      </Link>
                    );
                    return (
                      <tr key={c.id} className="row-hover row-link">
                        <td className="rounded-l-xl p-0">
                          <Link href={href} className="block px-4 py-3 font-semibold">
                            {c.case_no_internal}
                          </Link>
                        </td>
                        <td className="p-0">{cell(borrower ?? "—")}</td>
                        <td className="p-0">{cell(<span className={`pill ${tone}`}>{label}</span>)}</td>
                        <td className="p-0">
                          {cell(c.is_commercial ? t("Commercial") : c.suit_type === "summary_o37" ? t("Summary (O.37)") : t("Ordinary"), "muted")}
                        </td>
                        <td className="p-0">
                          {cell(c.claim_amount_paise != null ? formatINR(Number(c.claim_amount_paise)) : "—", "text-right font-medium tabular-nums")}
                        </td>
                        <td className="p-0">
                          {cell(
                            c.archived_at ? fmtDate(c.archived_at) : `${ageDays(c.created_at)} ${t("days")}`,
                            `muted text-right tabular-nums ${!c.archived_at && ageDays(c.created_at) > 60 && !DONE.has(c.status) ? "text-amber-600 dark:text-amber-300" : ""}`,
                          )}
                        </td>
                        <td className="rounded-r-xl px-3 py-2 text-right">
                          <Link href={href} className="btn px-3 py-1 text-xs">
                            {t("Open")} →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {!shown.length && (
                    <tr>
                      <td colSpan={7} className="muted px-4 py-8 text-center">
                        {cases?.length ? t("No cases in this view.") : t("No cases visible to you.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Right rail: what needs doing now */}
          <aside className="space-y-5">
            {isAdmin && (
              <section className="glass-card fade-up p-5">
                <h2 className="text-lg font-semibold">{t("Quick actions")}</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href="/dashboard/cases/new" className="btn btn-primary py-2.5 text-sm">
                    ＋ {t("New case")}
                  </Link>
                  <Link href="/dashboard/batches" className="btn py-2.5 text-sm">
                    ⇪ {t("Bulk upload")}
                  </Link>
                  <Link href="/dashboard/masters" className="btn py-2.5 text-sm">
                    🏛 {t("Banks & courts")}
                  </Link>
                  <Link href="/dashboard/team" className="btn py-2.5 text-sm">
                    👥 {t("Team & roles")}
                  </Link>
                </div>
              </section>
            )}

            <section className="glass-card fade-up p-5" style={{ animationDelay: "120ms" }}>
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

            {(isApprover || isAdmin) && (
              <section id="approvals" className="glass-card fade-up scroll-mt-24 p-5" style={{ animationDelay: "180ms" }}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{t("Awaiting my approval")}</h2>
                  {!!approvalQueue.length && <span className="pill pill-amber">{approvalQueue.length}</span>}
                </div>
                <div className="mt-3 space-y-2">
                  {approvalQueue.map((d) => (
                    <Link key={d.id} href={`/dashboard/cases/${d.case_id}`} className="row-hover flex items-center justify-between gap-2 rounded-xl px-2 py-2.5">
                      <span>
                        <span className="font-semibold">{one(d.cases as Rel<{ case_no_internal: string }>)?.case_no_internal}</span>
                        <span className="muted text-sm"> · {title(d.doc_kind)}</span>
                      </span>
                      <span className="btn btn-primary px-3 py-1 text-xs">{t("Review")} →</span>
                    </Link>
                  ))}
                  {!approvalQueue.length && <p className="muted text-sm">{t("Nothing waiting for approval.")}</p>}
                </div>
              </section>
            )}

            <section className="glass-card fade-up p-5" style={{ animationDelay: "240ms" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t("My tasks")}</h2>
                {!!tasks?.length && (
                  <Link href="/dashboard/tasks" className="btn px-3 py-1 text-xs">
                    {t("Open task view →")}
                  </Link>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {tasks?.map((tk) => (
                  <Link
                    key={tk.id}
                    href={fieldOnly ? "/dashboard/tasks" : `/dashboard/cases/${tk.case_id}`}
                    className="row-hover flex items-center justify-between gap-2 rounded-xl px-2 py-2.5"
                  >
                    <span className="font-semibold">{title(tk.kind)}</span>
                    <span className="muted text-sm">
                      {one(tk.cases as Rel<{ case_no_internal: string }>)?.case_no_internal} · {title(tk.status)}
                    </span>
                  </Link>
                ))}
                {!tasks?.length && <p className="muted text-sm">{t("No tasks assigned.")}</p>}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}

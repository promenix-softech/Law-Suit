import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, title } from "@/lib/ui";
import { TaskProgress } from "./task-controls";

export const metadata = { title: "My tasks — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const KIND_LABEL: Record<string, string> = {
  collect_docs: "Collect documents",
  notary: "Notary / stamp",
  efile: "E-filing",
  dispatch_notice: "Dispatch notice",
  draft: "Draft",
  approve: "Approve",
};

/** Field staff view, phone-first: open tasks with start / done, note and photo proof. */
export default async function TasksPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const [{ data: profile }, { data: roles }, { data: tasks }] = await Promise.all([
    supabase.from("profiles").select("org_id, full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase
      .from("tasks")
      .select("id, case_id, kind, status, due_at, instructions, note, done_at, cases(case_no_internal, courts(name), bank_branches(branch_name))")
      .eq("assignee_id", auth.user.id)
      .order("due_at", { ascending: true, nullsFirst: false }),
  ]);
  if (!profile) redirect("/login");
  const roleNames = (roles ?? []).map((r) => r.role as string);
  const open = (tasks ?? []).filter((t) => t.status === "open" || t.status === "in_progress");
  const closed = (tasks ?? []).filter((t) => t.status === "done").slice(0, 10);
  const today = new Date().toISOString();

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 pb-16 pt-6">
        <div className="fade-up">
          <Link href="/dashboard" className="muted text-sm hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">My tasks</h1>
          <p className="muted text-sm">{open.length} open</p>
        </div>

        {open.map((t, i) => {
          const c = one(t.cases as Rel<{ case_no_internal: string; courts: Rel<{ name: string }>; bank_branches: Rel<{ branch_name: string }> }>);
          const overdue = t.due_at && t.due_at < today;
          return (
            <section key={t.id} className="glass-card fade-up p-5" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">{KIND_LABEL[t.kind] ?? title(t.kind)}</p>
                  <p className="muted text-sm">
                    {c?.case_no_internal}
                    {one(c?.courts ?? null)?.name ? ` · ${one(c!.courts)!.name}` : ""}
                    {one(c?.bank_branches ?? null)?.branch_name ? ` · ${one(c!.bank_branches)!.branch_name}` : ""}
                  </p>
                </div>
                <span className={`pill ${overdue ? "pill-red" : t.status === "in_progress" ? "pill-amber" : "pill-neutral"}`}>
                  {t.due_at ? `${overdue ? "Overdue · " : "Due "}${fmtDate(t.due_at)}` : title(t.status)}
                </span>
              </div>
              {t.instructions && <p className="mt-2 text-sm">{t.instructions}</p>}
              <TaskProgress taskId={t.id} orgId={profile.org_id} caseId={t.case_id} status={t.status} />
            </section>
          );
        })}
        {!open.length && <p className="glass-card p-5 text-sm">Nothing open. 🎉</p>}

        {closed.length > 0 && (
          <section className="glass-card p-5">
            <p className="label">Recently done</p>
            <ul className="mt-2 space-y-1 text-sm">
              {closed.map((t) => (
                <li key={t.id}>
                  {KIND_LABEL[t.kind] ?? title(t.kind)} · {one(t.cases as Rel<{ case_no_internal: string }>)?.case_no_internal}
                  {t.done_at ? ` · ${fmtDate(t.done_at)}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

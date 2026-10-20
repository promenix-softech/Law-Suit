import Link from "next/link";
import { redirect } from "next/navigation";
import { formatINR } from "@civil-suits/domain";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export const metadata = { title: "Dashboard — Civil Suits" };

const STATUS_LABEL: Record<string, string> = {
  case_created: "Case created",
  docs_uploaded: "Docs uploaded",
  extraction_review: "Extraction review",
  notice_generated: "Notice generated",
  notice_sent: "Notice sent",
  mediation_12a: "12A mediation",
  drafting: "Drafting",
  in_approval: "In approval",
  approved: "Approved",
  filed: "Filed",
};

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
      .select("id, case_no_internal, status, suit_type, claim_amount_paise, is_commercial, needs_12a")
      .order("case_no_internal"),
    supabase.from("tasks").select("id, kind, status, due_at, cases(case_no_internal)").eq("assignee_id", auth.user.id),
    supabase
      .from("drafts")
      .select("id, doc_kind, created_by, updated_at, case_id, cases(case_no_internal)")
      .eq("status", "in_approval")
      .order("updated_at"),
  ]);

  const org = profile?.organizations as { name: string } | { name: string }[] | null | undefined;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
  const isApprover = roles?.some((r) => r.role === "approver") ?? false;
  // Maker-checker: an approver's queue never shows their own drafts.
  const queue = (pending ?? []).filter((d) => d.created_by !== auth.user.id);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{orgName ?? "Civil Suits"}</h1>
          <p className="text-sm text-zinc-500">
            {profile?.full_name} · {roles?.map((r) => r.role).join(", ") || "no role"}
          </p>
        </div>
        <form action={signOut}>
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
            Sign out
          </button>
        </form>
      </header>

      {isApprover && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Awaiting my approval ({queue.length})</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {queue.map((d) => {
              const c = d.cases as { case_no_internal: string } | { case_no_internal: string }[] | null;
              const caseNo = Array.isArray(c) ? c[0]?.case_no_internal : c?.case_no_internal;
              return (
                <li key={d.id} className="rounded-md border border-amber-300 px-3 py-2 dark:border-amber-800">
                  <Link href={`/dashboard/cases/${d.case_id}`} className="font-medium underline">
                    {caseNo}
                  </Link>{" "}
                  · {d.doc_kind.replaceAll("_", " ")}
                </li>
              );
            })}
            {!queue.length && <li className="text-zinc-500">Nothing waiting for approval.</li>}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Cases ({cases?.length ?? 0})</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Case</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Suit type</th>
                <th className="px-3 py-2 text-right">Claim</th>
                <th className="px-3 py-2">12A</th>
              </tr>
            </thead>
            <tbody>
              {cases?.map((c) => (
                <tr key={c.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/dashboard/cases/${c.id}`} className="underline">
                      {c.case_no_internal}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{STATUS_LABEL[c.status] ?? c.status}</td>
                  <td className="px-3 py-2">{c.suit_type ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {c.claim_amount_paise != null ? formatINR(Number(c.claim_amount_paise)) : "—"}
                  </td>
                  <td className="px-3 py-2">{c.needs_12a ? "Required" : "—"}</td>
                </tr>
              ))}
              {!cases?.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                    No cases visible to you.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">My tasks ({tasks?.length ?? 0})</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {tasks?.map((t) => {
            const c = t.cases as { case_no_internal: string } | { case_no_internal: string }[] | null;
            const caseNo = Array.isArray(c) ? c[0]?.case_no_internal : c?.case_no_internal;
            return (
              <li key={t.id} className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                {t.kind} · {caseNo} · {t.status}
              </li>
            );
          })}
          {!tasks?.length && <li className="text-zinc-500">No tasks assigned.</li>}
        </ul>
      </section>
    </main>
  );
}

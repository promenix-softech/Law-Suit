import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { RoleToggle } from "./role-toggle";

export const metadata = { title: "Team & roles — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const ROLES = ["admin", "drafter", "approver", "field"] as const;

/** Admin-only: who is in the office, which roles they hold, and their open workload. */
export default async function TeamPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { t } = await getT();

  const [{ data: profile }, { data: myRoles }, { data: people }, { data: roles }, { data: cases }, { data: tasks }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("cases").select("assigned_drafter, assigned_approver, status").is("archived_at", null),
    supabase.from("tasks").select("assignee_id, status"),
  ]);
  const roleNames = (myRoles ?? []).map((r) => r.role as string);
  if (!roleNames.includes("admin")) redirect("/dashboard");

  const has = new Set((roles ?? []).map((r) => `${r.user_id}:${r.role}`));
  const DONE = new Set(["filed", "listed", "disposed"]);
  const open = (cases ?? []).filter((c) => !DONE.has(c.status));
  const label: Record<(typeof ROLES)[number], string> = { admin: t("Admin"), drafter: t("Drafter"), approver: t("Approver"), field: t("Field") };

  return (
    <>
      <TopBar org={one(profile?.organizations as Rel<{ name: string }>)?.name} name={profile?.full_name} roles={roleNames} />
      <main className="w-full flex-1 space-y-5 px-4 pb-16 pt-8 lg:px-6">
        <div className="fade-up">
          <h1 className="text-3xl font-semibold tracking-tight">{t("Team & roles")}</h1>
          <p className="muted mt-1 text-sm">
            {t("Tap a role to give or remove it. A person can hold several roles; the approver can never approve a draft they wrote or edited.")}
          </p>
        </div>

        <section className="glass-card fade-up overflow-x-auto p-2">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="label">
                <th className="px-4 py-3 font-semibold">{t("Person")}</th>
                <th className="px-4 py-3 font-semibold">{t("Roles")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("Drafting")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("Approving")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("Open tasks")}</th>
              </tr>
            </thead>
            <tbody>
              {(people ?? []).map((p) => (
                <tr key={p.id} className="row-hover">
                  <td className="rounded-l-xl px-4 py-3 font-semibold">
                    {p.full_name}
                    {p.id === auth.user!.id && <span className="muted text-xs"> ({t("you")})</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {ROLES.map((r) => (
                        <RoleToggle key={r} userId={p.id} role={r} label={label[r]} on={has.has(`${p.id}:${r}`)} locked={r === "admin" && p.id === auth.user!.id} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{open.filter((c) => c.assigned_drafter === p.id).length}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{open.filter((c) => c.assigned_approver === p.id).length}</td>
                  <td className="rounded-r-xl px-4 py-3 text-right tabular-nums">
                    {(tasks ?? []).filter((x) => x.assignee_id === p.id && (x.status === "open" || x.status === "in_progress")).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="glass-card fade-up space-y-3 p-5">
          <div>
            <h2 className="text-lg font-semibold">{t("Invite a person")}</h2>
            <p className="muted mt-1 text-sm">
              {t("They get an email to set their own password and join this office with the roles you choose. Nobody else, including Promenix, sees the password.")}
            </p>
          </div>
          <InviteForm
            labels={{
              name: t("Full name"),
              email: t("Email"),
              roles: t("Roles"),
              send: t("Send invitation"),
              sending: t("Sending…"),
              admin: label.admin,
              drafter: label.drafter,
              approver: label.approver,
              field: label.field,
            }}
          />
        </section>
      </main>
    </>
  );
}

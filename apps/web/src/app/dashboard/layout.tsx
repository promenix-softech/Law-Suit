import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { SideNav, type NavItem } from "@/components/side-nav";
import type { T } from "@/lib/i18n";
import { myFirmCode, requestFirm } from "@/lib/firm-server";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";

/** Shown to the people of an office the super admin has paused, in place of every page. */
function OfficePaused({ office, reason, t }: { office?: string; reason?: string | null; t: T }) {
  return (
    <main className="grid min-h-screen w-full place-items-center px-4">
      <div className="glass-card max-w-md p-8 text-center">
        <p className="text-4xl">⏸</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("This office's access is paused")}</h1>
        {office && <p className="muted mt-1 text-sm">{office}</p>}
        {reason && <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm">“{reason}”</p>}
        <p className="muted mt-4 text-sm">{t("Nothing is deleted. Your cases and papers are as you left them; ask Promenix to resume the office.")}</p>
        <form action={signOut} className="mt-6">
          <button className="btn px-4 py-2 text-sm">{t("Sign out")}</button>
        </form>
      </div>
    </main>
  );
}

/**
 * Shell for every signed-in page: role-aware left navigation and a full-width content area.
 * Pages still check auth and roles themselves; this only decides which links to show.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const supabase = await createClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !auth.user) return <>{children}</>;
  // A session never crosses firms: on another firm's address (or after choosing another firm's
  // code) the account is signed out. RLS keeps the data apart regardless.
  const firm = await requestFirm();
  if (firm) {
    const own = await myFirmCode(supabase, auth.user.id);
    if (own && own !== firm.code) redirect("/auth/sign-out");
  }

  const { t } = await getT();
  const [{ data: roles }, { count: tasksOpen }, { data: pending }, { data: accessRow }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", auth.user.id).in("status", ["open", "in_progress"]),
    supabase.from("drafts").select("status, created_by, cases!inner(archived_at)").in("status", ["in_approval", "returned"]).is("cases.archived_at", null),
    supabase.rpc("my_access"),
  ]);
  // A paused office: the database gives its people no rows at all, so the pages would only fail.
  // Say what happened instead (the pages below are not rendered).
  const access = accessRow as { office?: string; suspended?: boolean; reason?: string | null; platform_admin?: boolean } | null;
  if (access?.suspended) return <OfficePaused office={access.office} reason={access.reason} t={t} />;
  const r = new Set((roles ?? []).map((x) => x.role as string));
  const admin = r.has("admin");
  const fieldOnly = r.size > 0 && [...r].every((x) => x === "field");
  // What waits for this person on the approvals page: papers to decide (maker-checker: never
  // their own) and their own papers that were sent back.
  const canApprove = admin || r.has("approver");
  const toDecide = canApprove ? (pending ?? []).filter((d) => d.status === "in_approval" && d.created_by !== auth.user!.id).length : 0;
  const sentBack = (pending ?? []).filter((d) => d.status === "returned" && d.created_by === auth.user!.id).length;

  const work = t("Work");
  const office = t("Office");
  // The super admin runs the platform, not an office: their navigation is the console only.
  const superAdmin = access?.platform_admin === true;
  const superItems: NavItem[] = [
    { href: "/dashboard/platform", label: t("All offices"), icon: "◆", group: t("Super admin") },
    { href: "/dashboard/platform/new", label: t("New office"), icon: "＋", group: t("Super admin") },
<<<<<<< HEAD
    { href: "/dashboard/platform/invoices", label: t("Invoices"), icon: "₹", group: t("Super admin") },
=======
>>>>>>> 0277fc74ca50dc7f31fa723ddcac90a0effab32c
  ];
  const items: NavItem[] = superAdmin ? superItems : [
    ...(fieldOnly ? [] : [{ href: "/dashboard", label: t("Dashboard"), icon: "▦", group: work }]),
    ...(admin ? [{ href: "/dashboard/cases/new", label: t("New case"), icon: "＋", group: work }] : []),
    ...(canApprove || r.has("drafter") ? [{ href: "/dashboard/approvals", label: t("Approvals"), icon: "✓", badge: toDecide + sentBack, group: work }] : []),
    { href: "/dashboard/tasks", label: t("My tasks"), icon: "☰", badge: tasksOpen ?? 0, group: work },
    ...(admin || r.has("approver") || r.has("drafter") ? [{ href: "/dashboard/reports", label: t("Reports"), icon: "▤", group: work }] : []),
    ...(admin
      ? [
          { href: "/dashboard/batches", label: t("Bulk upload"), icon: "⇪", group: work },
          { href: "/dashboard/masters", label: t("Banks & courts"), icon: "🏛", group: office },
          { href: "/dashboard/team", label: t("Team & roles"), icon: "👥", group: office },
          { href: "/dashboard/settings", label: t("Office settings"), icon: "⚙", group: office },
          { href: "/dashboard/audit", label: t("Audit log"), icon: "⛓", group: office },
          { href: "/dashboard/billing", label: t("Billing"), icon: "₹", group: office },
        ]
      : []),
    { href: "/dashboard/help", label: t("How it works"), icon: "?", group: work },
  ];

  return (
    // Phones: the section links are a strip above the page; from lg up, a rail beside it.
    <div className="flex min-h-screen w-full flex-1 flex-col lg:flex-row">
      <SideNav items={items} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

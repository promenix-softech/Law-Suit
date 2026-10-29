import { SideNav, type NavItem } from "@/components/side-nav";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";

/**
 * Shell for every signed-in page: role-aware left navigation and a full-width content area.
 * Pages still check auth and roles themselves; this only decides which links to show.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const supabase = await createClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !auth.user) return <>{children}</>;

  const { t } = await getT();
  const [{ data: roles }, { count: tasksOpen }, { data: pending }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", auth.user.id).in("status", ["open", "in_progress"]),
    supabase.from("drafts").select("created_by").eq("status", "in_approval"),
  ]);
  const r = new Set((roles ?? []).map((x) => x.role as string));
  const admin = r.has("admin");
  const fieldOnly = r.size > 0 && [...r].every((x) => x === "field");
  // Maker-checker: nobody's queue counts their own drafts.
  const queue = (pending ?? []).filter((d) => d.created_by !== auth.user!.id).length;

  const work = t("Work");
  const office = t("Office");
  const items: NavItem[] = [
    ...(fieldOnly ? [] : [{ href: "/dashboard", label: t("Dashboard"), icon: "▦", group: work }]),
    ...(admin ? [{ href: "/dashboard/cases/new", label: t("New case"), icon: "＋", group: work }] : []),
    ...(admin || r.has("approver") ? [{ href: "/dashboard#approvals", label: t("Approvals"), icon: "✓", badge: queue, group: work }] : []),
    { href: "/dashboard/tasks", label: t("My tasks"), icon: "☰", badge: tasksOpen ?? 0, group: work },
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
  ];

  return (
    <div className="flex min-h-screen w-full flex-1">
      <SideNav items={items} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

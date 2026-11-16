import { redirect } from "next/navigation";
import { SideNav, type NavItem } from "@/components/side-nav";
import { myFirmCode, requestFirm } from "@/lib/firm-server";
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
  // A session never crosses firms: on another firm's address (or after choosing another firm's
  // code) the account is signed out. RLS keeps the data apart regardless.
  const firm = await requestFirm();
  if (firm) {
    const own = await myFirmCode(supabase, auth.user.id);
    if (own && own !== firm.code) redirect("/auth/sign-out");
  }

  const { t } = await getT();
  const [{ data: roles }, { count: tasksOpen }, { data: pending }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", auth.user.id).in("status", ["open", "in_progress"]),
    supabase.from("drafts").select("status, created_by, cases!inner(archived_at)").in("status", ["in_approval", "returned"]).is("cases.archived_at", null),
  ]);
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
  const items: NavItem[] = [
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

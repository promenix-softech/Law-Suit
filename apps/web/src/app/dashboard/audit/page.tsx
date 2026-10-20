import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { createClient } from "@/lib/supabase/server";
import { title } from "@/lib/ui";

export const metadata = { title: "Audit log — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const PAGE = 100;
const ACTION_TONE: Record<string, string> = { insert: "pill-green", update: "pill-violet", delete: "pill-red" };

const at = (ts: string) =>
  new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Admin-only: latest audit entries and an integrity check of the hash chain. */
export default async function AuditPage({ searchParams }: PageProps<"/dashboard/audit">) {
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" ? sp.entity : undefined;

  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!roleNames.includes("admin")) redirect("/dashboard");

  let q = supabase.from("audit_log").select("id, actor_id, action, entity, entity_id, at, row_hash").order("id", { ascending: false }).limit(PAGE);
  if (entity) q = q.eq("entity", entity);
  const [{ data: rows }, { data: chain }, { data: people }] = await Promise.all([
    q,
    supabase.rpc("verify_audit_chain"),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const check = (chain as { rows_checked: number; first_broken_id: number | null }[] | null)?.[0];
  const entities = ["cases", "drafts", "draft_versions", "approvals", "documents", "extracted_fields", "notices", "mediations", "ocr_jobs", "user_roles"];

  return (
    <>
      <TopBar org={one(profile?.organizations as Rel<{ name: string }>)?.name} name={profile?.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 pb-16 pt-8">
        <div className="fade-up">
          <Link href="/dashboard" className="muted text-sm hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Audit log</h1>
          <p className="muted mt-1 text-sm">Append-only. Every entry is chained to the previous one by a SHA-256 hash.</p>
        </div>

        <div className="glass-card fade-up flex flex-wrap items-center justify-between gap-3 p-5" style={{ animationDelay: "60ms" }}>
          <div>
            <p className="label">Chain integrity</p>
            {check ? (
              check.first_broken_id == null ? (
                <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">✓ Intact — {check.rows_checked} entries verified</p>
              ) : (
                <p className="mt-1 font-semibold text-red-600 dark:text-red-400">
                  ✗ Broken at entry #{check.first_broken_id} — investigate immediately
                </p>
              )
            ) : (
              <p className="muted mt-1">Could not verify.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/audit" className={`btn px-3 py-1 text-xs ${!entity ? "btn-primary" : ""}`}>
              All
            </Link>
            {entities.map((e) => (
              <Link key={e} href={`/dashboard/audit?entity=${e}`} className={`btn px-3 py-1 text-xs ${entity === e ? "btn-primary" : ""}`}>
                {title(e)}
              </Link>
            ))}
          </div>
        </div>

        <div className="glass-card fade-up overflow-x-auto p-2" style={{ animationDelay: "120ms" }}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="label">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">When (IST)</th>
                <th className="px-4 py-3 font-semibold">Who</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Record</th>
                <th className="px-4 py-3 font-semibold">Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id} className="row-hover">
                  <td className="muted px-4 py-2 tabular-nums">{r.id}</td>
                  <td className="px-4 py-2 tabular-nums">{at(r.at)}</td>
                  <td className="px-4 py-2">{r.actor_id ? (names.get(r.actor_id) ?? "Unknown user") : "System"}</td>
                  <td className="px-4 py-2">
                    <span className={`pill ${ACTION_TONE[r.action] ?? "pill-neutral"}`}>{r.action}</span>
                  </td>
                  <td className="px-4 py-2">
                    {title(r.entity)} <span className="muted font-mono text-xs">{r.entity_id?.slice(0, 8)}</span>
                  </td>
                  <td className="muted px-4 py-2 font-mono text-xs">{r.row_hash.slice(0, 12)}…</td>
                </tr>
              ))}
              {!rows?.length && (
                <tr>
                  <td colSpan={6} className="muted px-4 py-8 text-center">
                    No entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted text-xs">Showing the latest {PAGE} entries. Values themselves are not stored here — only hashes of each change.</p>
      </main>
    </>
  );
}

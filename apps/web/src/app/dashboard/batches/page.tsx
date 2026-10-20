import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, title } from "@/lib/ui";
import { UploadBatch } from "./upload-batch";

export const metadata = { title: "Bulk upload — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const BATCH_TONE: Record<string, string> = {
  uploaded: "pill-neutral",
  splitting: "pill-amber",
  review: "pill-violet",
  applying: "pill-amber",
  applied: "pill-green",
  failed: "pill-red",
};

/** Admin-only: upload one scan holding many loan files; review and confirm the proposed split. */
export default async function BatchesPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("org_id, full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!roleNames.includes("admin") || !profile) redirect("/dashboard");

  const { data: batches } = await supabase
    .from("batches")
    .select("id, storage_path, status, page_count, error, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 pb-16 pt-8">
        <div className="fade-up">
          <Link href="/dashboard" className="muted text-sm hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Bulk upload</h1>
          <p className="muted mt-1 text-sm">
            One PDF with many loan files (up to 300 pages, 50 MB). Pages are read and grouped by loan account in code; you confirm
            the split before any case is created.
          </p>
        </div>

        <section className="glass-card fade-up p-6" style={{ animationDelay: "60ms" }}>
          <UploadBatch orgId={profile.org_id} />
        </section>

        <section className="glass-card fade-up p-6" style={{ animationDelay: "100ms" }}>
          <h2 className="text-lg font-semibold">Uploads</h2>
          {batches?.length ? (
            <ul className="mt-4 divide-y divide-white/20">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span className="font-medium">
                    Upload of {fmtDate(b.created_at)}
                    {b.page_count ? ` · ${b.page_count} pages` : ""}
                  </span>
                  <span className={`pill ${BATCH_TONE[b.status] ?? "pill-neutral"}`}>{title(b.status)}</span>
                  {b.error && <span className="text-red-600 dark:text-red-400">{b.error}</span>}
                  {(b.status === "review" || b.status === "applied") && (
                    <Link className="btn px-3 py-1 text-xs" href={`/dashboard/batches/${b.id}`}>
                      {b.status === "review" ? "Review split →" : "View"}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted mt-3 text-sm">No bulk uploads yet.</p>
          )}
        </section>
      </main>
    </>
  );
}

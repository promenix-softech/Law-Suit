import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { TopBar } from "@/components/top-bar";
import { createClient } from "@/lib/supabase/server";
import { title } from "@/lib/ui";
import { SplitReview, type ReviewPage } from "./split-review";

export const metadata = { title: "Review split — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function BatchReviewPage({ params }: PageProps<"/dashboard/batches/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
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

  const { data: batch } = await supabase.from("batches").select("id, storage_path, status, page_count, plan").eq("id", id).maybeSingle();
  if (!batch) notFound();
  const [{ data: pages }, { data: cases }, signed] = await Promise.all([
    supabase.from("batch_pages").select("page_no, class, class_confidence, account_last4, borrower_hint, group_no, flags").eq("batch_id", id).order("page_no"),
    supabase.from("cases").select("id, case_no_internal").order("case_no_internal").limit(500),
    supabase.storage.from("case-batches").createSignedUrl(batch.storage_path, 300),
  ]);

  const review: ReviewPage[] = (pages ?? []).map((p) => ({
    pageNo: p.page_no,
    cls: p.class,
    confidence: p.class_confidence == null ? null : Number(p.class_confidence),
    last4: p.account_last4,
    borrower: p.borrower_hint,
    group: p.group_no,
    flags: (p.flags as string[] | null) ?? [],
  }));

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 pb-16 pt-8">
        <div className="fade-up">
          <Link href="/dashboard/batches" className="muted text-sm hover:underline">
            ← Bulk upload
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Review split</h1>
          <p className="muted mt-1 text-sm">
            {batch.page_count ?? "—"} pages · {title(batch.status)}. Move pages between groups
            by changing the group number; give each group a new case number or attach it to an existing case.
          </p>
        </div>
        {batch.status === "review" ? (
          <SplitReview batchId={batch.id} pages={review} cases={(cases ?? []).map((c) => ({ id: c.id, no: c.case_no_internal }))} pdfUrl={signed.data?.signedUrl ?? null} />
        ) : (
          <p className="glass-card p-6 text-sm">This upload is {title(batch.status).toLowerCase()}; the split can no longer be changed.</p>
        )}
      </main>
    </>
  );
}

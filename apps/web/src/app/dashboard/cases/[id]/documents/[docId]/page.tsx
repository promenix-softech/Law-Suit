import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { scanForInjection, stripInvisible } from "@civil-suits/domain";
import { decryptText } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/ui";

export const metadata = { title: "OCR text — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** OCR text, page by page, next to the original scan. Text is decrypted server-side only. */
export default async function DocumentTextPage({ params }: PageProps<"/dashboard/cases/[id]/documents/[docId]">) {
  const { id, docId } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: doc }, { data: pages }, { data: profile }, { data: roles }, { data: jobs }] = await Promise.all([
    supabase.from("documents").select("id, case_id, storage_path, created_at, cases(case_no_internal)").eq("id", docId).maybeSingle(),
    supabase.from("document_pages").select("page_no, ocr_text_enc").eq("document_id", docId).order("page_no"),
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("ocr_jobs").select("language, status, updated_at").eq("document_id", docId).order("created_at", { ascending: false }).limit(1),
  ]);
  if (!doc || doc.case_id !== id) notFound();

  const { data: signed } = await supabase.storage.from("case-files").createSignedUrl(doc.storage_path, 300);
  const job = jobs?.[0];
  const caseNo = one(doc.cases as Rel<{ case_no_internal: string }>)?.case_no_internal;

  return (
    <>
      <TopBar
        org={one(profile?.organizations as Rel<{ name: string }>)?.name}
        name={profile?.full_name}
        roles={(roles ?? []).map((r) => r.role as string)}
      />
      <main className="w-full flex-1 lg:px-6 space-y-5 px-4 pb-16 pt-8">
        <div className="fade-up">
          <Link href={`/dashboard/cases/${id}`} className="muted text-sm hover:underline">
            ← {caseNo}
          </Link>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">OCR text</h1>
            {signed?.signedUrl && (
              <a href={signed.signedUrl} target="_blank" rel="noreferrer" className="btn">
                📄 Open original scan
              </a>
            )}
          </div>
          <p className="muted mt-1 text-sm">
            {doc.storage_path.split("/").pop()?.replace(/^\d+-/, "")} · uploaded {fmtDate(doc.created_at)}
            {job && ` · ${job.language === "mr-IN" ? "Marathi" : "English"} OCR, ${fmtDate(job.updated_at)}`}
          </p>
        </div>

        {pages?.map((p, i) => {
          let text: string;
          try {
            text = p.ocr_text_enc ? decryptText(p.ocr_text_enc) : "";
          } catch {
            text = "⚠ This page could not be decrypted.";
          }
          // Prompt-injection tripwire: the page may carry text aimed at an AI (skill prompt-injection-defense).
          const scan = scanForInjection(text);
          const hidden = stripInvisible(text) !== text;
          return (
            <section key={p.page_no} className="glass-card fade-up p-6" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <p className="label">
                Page {p.page_no}
                {scan.suspicious && <span className="pill pill-red ml-2">⚠ text addressed to an AI — check the scan</span>}
                {hidden && <span className="pill pill-amber ml-2">hidden characters</span>}
              </p>
              <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{text || "(no text found)"}</pre>
            </section>
          );
        })}
        {!pages?.length && <p className="muted text-sm">No OCR text yet. Run OCR from the case page.</p>}

        <p className="muted text-xs">
          OCR text is stored encrypted and shown only to users who can see this case. Verify against the original scan before
          relying on any figure.
        </p>
      </main>
    </>
  );
}

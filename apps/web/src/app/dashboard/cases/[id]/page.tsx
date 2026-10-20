import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { commercialCheck, formatINR, maharashtraCourtFee } from "@civil-suits/domain";
import { createClient } from "@/lib/supabase/server";
import { GenerateNotice, UploadScan } from "./case-actions";

export const metadata = { title: "Case — Civil Suits" };

const SIGNED_URL_SECONDS = 300; // ≤ 5 min, per security design

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function courtFee(paise: number | null): string {
  if (paise == null) return "—";
  try {
    return formatINR(maharashtraCourtFee(paise));
  } catch {
    return "Pending legal verification (below ₹1 lakh)";
  }
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "—";

export default async function CasePage({ params }: PageProps<"/dashboard/cases/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: c } = await supabase
    .from("cases")
    .select(
      "id, org_id, case_no_internal, status, suit_type, claim_amount_paise, is_commercial, needs_12a, urgent_interim_relief, assigned_drafter, courts(name), bank_branches(branch_name, ifsc, banks(name)), parties(id, name, role, address, aadhaar_last4, position), loans(facility_type, account_last4, sanction_date, sanction_amount_paise, roi_bps, npa_date, outstanding_paise, interest_upto_date)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: roles }, { data: docs }, { data: drafts }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("documents").select("id, storage_path, created_at").eq("case_id", id).order("created_at", { ascending: false }),
    supabase
      .from("drafts")
      .select("id, doc_kind, language, status, draft_versions(version, docx_path, created_at)")
      .eq("case_id", id),
  ]);

  const isAdmin = roles?.some((r) => r.role === "admin") ?? false;
  const canEdit = isAdmin || c.assigned_drafter === auth.user.id;

  const versions = (drafts ?? []).flatMap((d) =>
    (d.draft_versions ?? []).map((v) => ({ ...v, doc_kind: d.doc_kind, language: d.language })),
  );
  versions.sort((a, b) => b.version - a.version);

  const paths = [...(docs ?? []).map((d) => d.storage_path), ...versions.map((v) => v.docx_path).filter(Boolean)] as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("case-files").createSignedUrls(paths, SIGNED_URL_SECONDS);
    data?.forEach((s) => s.path && s.signedUrl && signed.set(s.path, s.signedUrl));
  }

  const loan = one(c.loans);
  const branch = one(c.bank_branches) as { branch_name: string; ifsc: string | null; banks: Rel<{ name: string }> } | null;
  const claim = c.claim_amount_paise == null ? null : Number(c.claim_amount_paise);
  const check = claim == null ? null : commercialCheck({ specifiedValuePaise: claim, lenderIsBank: true, urgentInterimRelief: c.urgent_interim_relief });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
        ← All cases
      </Link>
      <header className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{c.case_no_internal}</h1>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800">{c.status.replaceAll("_", " ")}</span>
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">Bank &amp; court</h2>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-zinc-500">Bank</dt>
            <dd>{one(branch?.banks ?? null)?.name ?? "—"}</dd>
            <dt className="text-zinc-500">Branch</dt>
            <dd>{branch?.branch_name ?? "—"}</dd>
            <dt className="text-zinc-500">Court</dt>
            <dd>{(one(c.courts) as { name: string } | null)?.name ?? "—"}</dd>
          </dl>
        </section>

        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">Claim (computed in code)</h2>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-zinc-500">Claim incl. interest</dt>
            <dd className="font-medium">{claim == null ? "—" : formatINR(claim)}</dd>
            <dt className="text-zinc-500">Court fee</dt>
            <dd>{courtFee(claim)}</dd>
            <dt className="text-zinc-500">Suit type</dt>
            <dd>{check?.isCommercial ? "Commercial suit" : "Ordinary / summary"}</dd>
            <dt className="text-zinc-500">Sec 12A mediation</dt>
            <dd>{check?.needs12A ? "Required before filing" : "Not required"}</dd>
          </dl>
        </section>

        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">Parties</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {[...(c.parties ?? [])]
              .sort((a, b) => a.position - b.position)
              .map((p) => (
                <li key={p.id}>
                  <span className="font-medium">{p.name}</span> · {p.role.replace("_", "-")}
                  {p.aadhaar_last4 && <span className="text-zinc-500"> · Aadhaar XXXX-XXXX-{p.aadhaar_last4}</span>}
                </li>
              ))}
          </ul>
        </section>

        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">Loan</h2>
          {loan ? (
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-zinc-500">Facility</dt>
              <dd>{loan.facility_type ?? "—"}</dd>
              <dt className="text-zinc-500">Account</dt>
              <dd>{loan.account_last4 ? `XXXXXX${loan.account_last4}` : "—"}</dd>
              <dt className="text-zinc-500">Sanctioned</dt>
              <dd>
                {loan.sanction_amount_paise == null ? "—" : formatINR(Number(loan.sanction_amount_paise))} on{" "}
                {fmtDate(loan.sanction_date)}
              </dd>
              <dt className="text-zinc-500">Rate</dt>
              <dd>{loan.roi_bps == null ? "—" : `${(loan.roi_bps / 100).toFixed(2)}% p.a.`}</dd>
              <dt className="text-zinc-500">NPA date</dt>
              <dd>{fmtDate(loan.npa_date)}</dd>
              <dt className="text-zinc-500">Outstanding</dt>
              <dd>
                {loan.outstanding_paise == null ? "—" : formatINR(Number(loan.outstanding_paise))} as on{" "}
                {fmtDate(loan.interest_upto_date)}
              </dd>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No loan details yet.</p>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Documents ({docs?.length ?? 0})</h2>
        {canEdit && (
          <div className="mt-3">
            <UploadScan orgId={c.org_id} caseId={c.id} />
          </div>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {docs?.map((d) => (
            <li key={d.id}>
              <a className="underline" href={signed.get(d.storage_path)} target="_blank" rel="noreferrer">
                {d.storage_path.split("/").pop()}
              </a>{" "}
              <span className="text-zinc-500">· {fmtDate(d.created_at)}</span>
            </li>
          ))}
          {!docs?.length && <li className="text-zinc-500">No scans uploaded yet.</li>}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Drafts</h2>
        {canEdit && (
          <div className="mt-3">
            <GenerateNotice caseId={c.id} />
          </div>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {versions.map((v) => (
            <li key={`${v.doc_kind}-${v.language}-${v.version}`}>
              <a className="underline" href={v.docx_path ? signed.get(v.docx_path) : undefined}>
                {v.doc_kind.replaceAll("_", " ")} ({v.language}) v{v.version}
              </a>{" "}
              <span className="text-zinc-500">· {fmtDate(v.created_at)}</span>
            </li>
          ))}
          {!versions.length && <li className="text-zinc-500">No drafts yet.</li>}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Paragraphs marked [[LEGAL_REVIEW]] (highlighted in the DOCX) must be checked by the advocate before use.
        </p>
      </section>
    </main>
  );
}

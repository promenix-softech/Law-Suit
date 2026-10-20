import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CASE_STATUSES, commercialCheck, formatINR, maharashtraCourtFee } from "@civil-suits/domain";
import { TopBar } from "@/components/top-bar";
import { createClient } from "@/lib/supabase/server";
import { caseStatus, draftStatus, fmtDate, title } from "@/lib/ui";
import { DecideDraft, GenerateDraft, MediationOutcome, MediationStart, NoticeForm, SubmitDraft, UploadScan } from "./case-actions";
import { OcrControls } from "./ocr-controls";

export const metadata = { title: "Case — Civil Suits" };

const SIGNED_URL_SECONDS = 300; // ≤ 5 min, per security design

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function courtFee(paise: number | null): string {
  if (paise == null) return "—";
  try {
    return formatINR(maharashtraCourtFee(paise));
  } catch {
    return "Pending verification";
  }
}

const STEPS = [
  "case_created",
  "docs_uploaded",
  "extraction_review",
  "notice_generated",
  "notice_sent",
  "mediation_12a",
  "drafting",
  "in_approval",
  "approved",
  "efiling_ready",
  "filed",
] as const;

function Stepper({ status, needs12A }: { status: string; needs12A: boolean }) {
  const steps = STEPS.filter((s) => s !== "mediation_12a" || needs12A);
  const at = CASE_STATUSES.indexOf(status as (typeof CASE_STATUSES)[number]);
  return (
    <ol className="flex min-w-max items-center gap-1">
      {steps.map((s, i) => {
        const idx = CASE_STATUSES.indexOf(s);
        const done = idx < at;
        const current = s === status;
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                current
                  ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-violet-500/30"
                  : done
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "muted bg-white/20 dark:bg-white/5"
              }`}
            >
              {done ? "✓" : i + 1} {caseStatus(s)[0]}
            </span>
            {i < steps.length - 1 && <span className={`h-px w-4 ${done ? "bg-emerald-500/50" : "bg-current opacity-15"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

function Section({ title: t, subtitle, children, delay = 0 }: { title: string; subtitle?: string; children: React.ReactNode; delay?: number }) {
  return (
    <section className="glass-card fade-up p-6" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="text-lg font-semibold">{t}</h2>
      {subtitle && <p className="muted mt-0.5 text-sm">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function CasePage({ params }: PageProps<"/dashboard/cases/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: c } = await supabase
    .from("cases")
    .select(
      "id, org_id, case_no_internal, status, suit_type, claim_amount_paise, is_commercial, needs_12a, urgent_interim_relief, assigned_drafter, courts(name), bank_branches(branch_name, ifsc, banks(name)), parties(id, name, role, address, aadhaar_last4, position), loans(facility_type, account_last4, sanction_date, sanction_amount_paise, roi_bps, npa_date, outstanding_paise, interest_upto_date), notices(id, dispatch_mode, tracking_no, sent_at), mediations(id, authority, applied_at, outcome, report_date, report_path)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: profile }, { data: roles }, { data: docs }, { data: drafts }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("documents").select("id, storage_path, created_at").eq("case_id", id).order("created_at", { ascending: false }),
    supabase
      .from("drafts")
      .select(
        "id, doc_kind, language, status, created_by, current_version, draft_versions(version, docx_path, created_at), approvals(decision, comments, created_at)",
      )
      .eq("case_id", id)
      .order("doc_kind"),
  ]);

  const docIds = (docs ?? []).map((d) => d.id);
  const { data: ocrJobs } = docIds.length
    ? await supabase
        .from("ocr_jobs")
        .select("id, document_id, status, pages_succeeded, error, created_at")
        .in("document_id", docIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const latestJob = new Map<string, NonNullable<typeof ocrJobs>[number]>();
  (ocrJobs ?? []).forEach((j) => latestJob.has(j.document_id) || latestJob.set(j.document_id, j));

  const roleNames = (roles ?? []).map((r) => r.role as string);
  const isApprover = roleNames.includes("approver");
  const canEdit = roleNames.includes("admin") || c.assigned_drafter === auth.user.id;

  const mediations = [...(c.mediations ?? [])];
  const notices = [...(c.notices ?? [])].sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));
  const versions = (drafts ?? []).flatMap((d) => d.draft_versions ?? []);
  const paths = [
    ...(docs ?? []).map((d) => d.storage_path),
    ...versions.map((v) => v.docx_path),
    ...mediations.map((m) => m.report_path),
  ].filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("case-files").createSignedUrls(paths, SIGNED_URL_SECONDS);
    data?.forEach((s) => s.path && s.signedUrl && signed.set(s.path, s.signedUrl));
  }

  const loan = one(c.loans);
  const branch = one(c.bank_branches) as { branch_name: string; ifsc: string | null; banks: Rel<{ name: string }> } | null;
  const claim = c.claim_amount_paise == null ? null : Number(c.claim_amount_paise);
  const check =
    claim == null ? null : commercialCheck({ specifiedValuePaise: claim, lenderIsBank: true, urgentInterimRelief: c.urgent_interim_relief });
  const [statusLabel, statusTone] = caseStatus(c.status);
  const parties = [...(c.parties ?? [])].sort((a, b) => a.position - b.position);

  return (
    <>
      <TopBar
        org={one(profile?.organizations as Rel<{ name: string }>)?.name}
        name={profile?.full_name}
        roles={roleNames}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 pb-16 pt-8">
        <div className="fade-up">
          <Link href="/dashboard" className="muted text-sm hover:underline">
            ← All cases
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{c.case_no_internal}</h1>
            <span className={`pill ${statusTone}`}>{statusLabel}</span>
            {c.is_commercial && <span className="pill pill-violet">Commercial</span>}
          </div>
          <p className="muted mt-1 text-sm">
            {parties[0]?.name ?? "—"} · {one(branch?.banks ?? null)?.name ?? "—"}, {branch?.branch_name ?? "—"}
          </p>
        </div>

        <div className="glass-card fade-up overflow-x-auto p-4" style={{ animationDelay: "60ms" }}>
          <Stepper status={c.status} needs12A={c.needs_12a} />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="glass-card fade-up p-6 md:col-span-1" style={{ animationDelay: "100ms" }}>
            <p className="label">Claim incl. interest</p>
            <p className="gradient-text mt-1 text-3xl font-semibold tracking-tight">{claim == null ? "—" : formatINR(claim)}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <Field label="Court fee">{courtFee(claim)}</Field>
              <Field label="Sec 12A">{check?.needs12A ? "Required" : "Not required"}</Field>
              <Field label="Suit type">{check?.isCommercial ? "Commercial" : c.suit_type === "summary_o37" ? "Summary (O.37)" : "Ordinary"}</Field>
              <Field label="Court">{(one(c.courts) as { name: string } | null)?.name ?? "—"}</Field>
            </dl>
            <p className="muted mt-4 text-xs">Computed in code from the loan data — never by AI.</p>
          </div>

          <div className="glass-card fade-up p-6" style={{ animationDelay: "140ms" }}>
            <p className="label">Loan</p>
            {loan ? (
              <dl className="mt-3 grid grid-cols-2 gap-4">
                <Field label="Facility">{loan.facility_type ?? "—"}</Field>
                <Field label="Account">{loan.account_last4 ? `XXXXXX${loan.account_last4}` : "—"}</Field>
                <Field label="Sanctioned">
                  {loan.sanction_amount_paise == null ? "—" : formatINR(Number(loan.sanction_amount_paise))}
                </Field>
                <Field label="On">{fmtDate(loan.sanction_date)}</Field>
                <Field label="Rate">{loan.roi_bps == null ? "—" : `${(loan.roi_bps / 100).toFixed(2)}% p.a.`}</Field>
                <Field label="NPA date">{fmtDate(loan.npa_date)}</Field>
              </dl>
            ) : (
              <p className="muted mt-3 text-sm">No loan details yet.</p>
            )}
          </div>

          <div className="glass-card fade-up p-6" style={{ animationDelay: "180ms" }}>
            <p className="label">Parties</p>
            <ul className="mt-3 space-y-3">
              {parties.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-400/40 to-violet-400/40 text-xs font-semibold">
                    {p.name
                      .split(" ")
                      .map((w: string) => w[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="muted text-xs">
                      {title(p.role)}
                      {p.aadhaar_last4 && ` · Aadhaar XXXX-XXXX-${p.aadhaar_last4}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Demand notice dispatch" subtitle="Record how and when the notice was sent" delay={220}>
            <ul className="space-y-2">
              {notices.map((n) => (
                <li key={n.id} className="flex items-center justify-between rounded-xl bg-white/20 px-3 py-2 text-sm dark:bg-white/5">
                  <span>
                    {title(n.dispatch_mode ?? "—")} {n.tracking_no && <span className="muted">· {n.tracking_no}</span>}
                  </span>
                  <span className="muted">{fmtDate(n.sent_at)}</span>
                </li>
              ))}
              {!notices.length && <p className="muted text-sm">Not dispatched yet.</p>}
            </ul>
            {canEdit && (
              <div className="mt-4">
                <NoticeForm caseId={c.id} />
              </div>
            )}
          </Section>

          {c.needs_12a ? (
            <Section title="Sec 12A pre-institution mediation" subtitle="Mandatory before filing a commercial suit" delay={260}>
              {mediations.map((m) => (
                <div key={m.id} className="mb-3 rounded-xl bg-white/20 px-3 py-2 text-sm dark:bg-white/5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{m.authority}</span>
                    <span className={`pill ${m.outcome === "pending" ? "pill-amber" : m.outcome === "settled" ? "pill-green" : "pill-violet"}`}>
                      {title(m.outcome ?? "pending")}
                    </span>
                  </div>
                  <p className="muted mt-1">
                    Applied {fmtDate(m.applied_at)}
                    {m.report_date && ` · Report ${fmtDate(m.report_date)}`}
                    {m.report_path && (
                      <>
                        {" · "}
                        <a href={signed.get(m.report_path)} target="_blank" rel="noreferrer" className="underline">
                          view report
                        </a>
                      </>
                    )}
                  </p>
                  {canEdit && m.outcome === "pending" && (
                    <div className="mt-3">
                      <MediationOutcome orgId={c.org_id} caseId={c.id} mediationId={m.id} />
                    </div>
                  )}
                </div>
              ))}
              {!mediations.length && (canEdit ? <MediationStart caseId={c.id} /> : <p className="muted text-sm">Not started.</p>)}
            </Section>
          ) : (
            <Section title="Sec 12A pre-institution mediation" delay={260}>
              <p className="muted text-sm">Not required for this case.</p>
            </Section>
          )}
        </div>

        <Section title={`Documents (${docs?.length ?? 0})`} subtitle="Scans are stored privately; links expire in 5 minutes" delay={300}>
          {canEdit && <UploadScan orgId={c.org_id} caseId={c.id} />}
          <ul className="mt-4 space-y-2">
            {docs?.map((d) => (
              <li key={d.id} className="row-hover flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
                <a className="min-w-0 flex-1 truncate hover:underline" href={signed.get(d.storage_path)} target="_blank" rel="noreferrer">
                  📄 {d.storage_path.split("/").pop()?.replace(/^\d+-/, "")}{" "}
                  <span className="muted">· {fmtDate(d.created_at)}</span>
                </a>
                <OcrControls documentId={d.id} caseId={c.id} job={latestJob.get(d.id) ?? null} canEdit={canEdit} />
              </li>
            ))}
            {!docs?.length && <p className="muted text-sm">No scans uploaded yet.</p>}
          </ul>
        </Section>

        <Section title="Drafts" subtitle="Generated from verified case data · approval enforced by the database" delay={340}>
          {canEdit && (
            <div className="flex flex-wrap gap-3">
              <GenerateDraft caseId={c.id} kind="demand_notice" label="Generate demand notice" />
              <GenerateDraft caseId={c.id} kind="plaint" label="Generate plaint" />
              <GenerateDraft caseId={c.id} kind="vakalatnama" label="Generate vakalatnama" />
              <GenerateDraft
                caseId={c.id}
                kind="affidavit"
                label={c.is_commercial ? "Generate statement of truth" : "Generate affidavit"}
              />
            </div>
          )}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {drafts?.map((d) => {
              const vs = [...(d.draft_versions ?? [])].sort((a, b) => b.version - a.version);
              const last = [...(d.approvals ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
              const [label, tone] = draftStatus(d.status);
              return (
                <div key={d.id} className="glass-card p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {title(d.doc_kind)} <span className="muted text-xs uppercase">{d.language}</span>
                    </span>
                    <span className={`pill ${tone}`}>{label}</span>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {vs.map((v) => (
                      <li key={v.version}>
                        <a className="btn px-3 py-1 text-xs" href={v.docx_path ? signed.get(v.docx_path) : undefined}>
                          ⬇ v{v.version} · {fmtDate(v.created_at)}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {last && (
                    <p className="muted mt-3 text-sm">
                      Last decision: <span className="font-medium">{title(last.decision)}</span>
                      {last.comments && <> — “{last.comments}”</>}
                    </p>
                  )}
                  {canEdit && (d.status === "draft" || d.status === "returned") && (
                    <div className="mt-3">
                      <SubmitDraft draftId={d.id} />
                    </div>
                  )}
                  {isApprover && d.status === "in_approval" && d.created_by !== auth.user.id && <DecideDraft draftId={d.id} />}
                </div>
              );
            })}
            {!drafts?.length && <p className="muted text-sm">No drafts yet.</p>}
          </div>
          <p className="muted mt-4 text-xs">
            Paragraphs marked [[LEGAL_REVIEW]] (highlighted in the DOCX) must be checked by the advocate before use.
          </p>
        </Section>
      </main>
    </>
  );
}

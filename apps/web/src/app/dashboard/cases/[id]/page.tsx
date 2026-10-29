import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CASE_STATUSES, courtFeeFor, formatINR, isStateCode, recoveryForum, stateName } from "@civil-suits/domain";
import { DraftPreview } from "@/components/draft-preview";
import { TopBar } from "@/components/top-bar";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { caseStatus, draftStatus, fmtDate, title } from "@/lib/ui";
import { DecideDraft, GenerateAll, GenerateDraft, MediationOutcome, MediationStart, NoticeForm, SubmitAll, SubmitDraft, UploadScan } from "./case-actions";
import type { DocKind } from "./actions";
import { display, editable, FIELDS } from "@/lib/extract/fields";
import { decodeField } from "@/lib/extract/stored";
import { ExtractionReview, type ReviewRow } from "./extraction-review";
import { peopleWithRole } from "@/lib/people";
import { AssignForm } from "./assign-form";
import { OcrControls } from "./ocr-controls";
import { BundleForm, ExportCase, MakePdf } from "./job-controls";
import { AssignTask } from "../../tasks/task-controls";
import { formatDocumentLines, readExecutedDocs } from "@/lib/particulars";
import { SuitParticulars } from "./particulars-form";

const rupeesText = (paise: number | string | null) => (paise == null || Number(paise) === 0 ? "" : String(Number(paise) / 100));
const isoToDot = (d: string | null) => (d ? d.split("-").reverse().join(".") : "");

const BUNDLE_READY = ["approved", "notary_stamp", "efiling_ready", "filed"];
type JobRow = {
  id: string;
  kind: string;
  payload: { draft_version_id?: string };
  status: string;
  output_path: string | null;
  output_meta: { fileName?: string; pages?: number; bytes?: number; entries?: { title: string; from: number; to: number; mark?: string | null }[] };
  error: string | null;
  created_at: string;
};
const JOB_TONE: Record<string, string> = { queued: "pill-neutral", running: "pill-amber", done: "pill-green", failed: "pill-red" };

export const metadata = { title: "Case — Civil Suits" };

const SIGNED_URL_SECONDS = 300; // ≤ 5 min, per security design

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Court fee under the court's state law; unconfigured states say so instead of guessing. */
function courtFee(paise: number | null, state: string | null | undefined): string {
  if (paise == null) return "—";
  if (!isStateCode(state)) return "Assign a court first";
  const r = courtFeeFor(state, paise);
  if (r.feePaise != null) return formatINR(r.feePaise);
  return r.act ? "Pending verification" : `Not configured for ${stateName(state)}`;
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

function Stepper({ status, needs12A, t }: { status: string; needs12A: boolean; t: T }) {
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
              {done ? "✓" : i + 1} {caseStatus(s, t)[0]}
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
  const { lang, t } = await getT();

  const { data: c } = await supabase
    .from("cases")
    .select(
      "id, org_id, case_no_internal, status, suit_type, claim_amount_paise, is_commercial, needs_12a, urgent_interim_relief, assigned_drafter, assigned_approver, courts(name, state), bank_branches(branch_name, ifsc, banks(name)), signatory_name, signatory_designation, signatory_age, penal_interest_paise, expenses_paise, parties(id, name, role, address, aadhaar_last4, position, through_capacity, through_name), loans(id, facility_type, account_last4, sanction_date, sanction_amount_paise, roi_bps, npa_date, outstanding_paise, interest_upto_date, application_date, purpose, executed_docs, tenure_months, created_at), notices(id, dispatch_mode, tracking_no, sent_at), mediations(id, authority, applied_at, outcome, report_date, report_path)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: profile }, { data: roles }, { data: docs }, { data: drafts }, { data: jobRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("documents").select("id, storage_path, created_at").eq("case_id", id).order("created_at", { ascending: false }),
    supabase
      .from("drafts")
      .select(
        "id, doc_kind, language, status, created_by, current_version, draft_versions(id, version, docx_path, pdf_path, created_at), approvals(decision, comments, created_at)",
      )
      .eq("case_id", id)
      .order("doc_kind"),
    supabase
      .from("doc_jobs")
      .select("id, kind, payload, status, output_path, output_meta, error, created_at")
      .eq("case_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const jobs = (jobRows ?? []) as JobRow[];
  const pdfJob = (versionId: string) => jobs.find((j) => j.kind === "draft_pdf" && j.payload.draft_version_id === versionId);
  const bundles = jobs.filter((j) => j.kind === "efiling_bundle");
  const exports = jobs.filter((j) => j.kind === "case_export").slice(0, 3);

  const docIds = (docs ?? []).map((d) => d.id);
  const { data: ocrJobs } = docIds.length
    ? await supabase
        .from("ocr_jobs")
        .select("id, document_id, pipeline, status, pages_succeeded, error, created_at")
        .in("document_id", docIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  // Latest job per document and pipeline ("digitise" = OCR text, "extract" = fields).
  const latestJob = new Map<string, NonNullable<typeof ocrJobs>[number]>();
  (ocrJobs ?? []).forEach((j) => {
    const k = `${j.pipeline}:${j.document_id}`;
    if (!latestJob.has(k)) latestJob.set(k, j);
  });

  const { data: extracted } = await supabase
    .from("extracted_fields")
    .select("field_key, value_enc, confidence, verified_at, verified_method, document_id")
    .eq("case_id", id);
  const byKey = new Map((extracted ?? []).map((e) => [e.field_key, e]));
  const reviewRows: ReviewRow[] = FIELDS.flatMap((f) => {
    const e = byKey.get(f.key);
    const p = e ? decodeField(e.value_enc) : null;
    if (!e || !p) return [];
    return [
      {
        key: f.key,
        label: f.label,
        kind: f.kind,
        raw: p.raw,
        initial: p.stored ? editable(f.kind, p.stored) : p.raw,
        display: p.stored ? display(f.kind, p.stored) : null,
        reason: p.reason,
        confidence: e.confidence == null ? null : Number(e.confidence),
        verified: !!e.verified_at,
        verifiedMethod: e.verified_method === "single" || e.verified_method === "bulk" ? e.verified_method : null,
        documentId: e.document_id,
      },
    ];
  });

  const [drafters, approvers, fieldStaff, { data: caseTasks }] = await Promise.all([
    peopleWithRole(supabase, "drafter"),
    peopleWithRole(supabase, "approver"),
    peopleWithRole(supabase, "field"),
    supabase
      .from("tasks")
      .select("id, kind, status, due_at, instructions, note, proof_path, assignee_id, done_at")
      .eq("case_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const nameOf = (uid: string | null) => [...drafters, ...approvers].find((p) => p.id === uid)?.name ?? "—";

  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (roleNames.length > 0 && roleNames.every((r) => r === "field")) redirect("/dashboard/tasks");
  // Admins may decide too; the database still refuses anyone who wrote or edited the draft.
  const isApprover = roleNames.includes("approver") || roleNames.includes("admin");
  const canEdit = roleNames.includes("admin") || c.assigned_drafter === auth.user.id;

  const mediations = [...(c.mediations ?? [])];
  const notices = [...(c.notices ?? [])].sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));
  const versions = (drafts ?? []).flatMap((d) => d.draft_versions ?? []);
  const paths = [
    ...(docs ?? []).map((d) => d.storage_path),
    ...versions.flatMap((v) => [v.docx_path, v.pdf_path]),
    ...bundles.map((b) => b.output_path),
    ...(caseTasks ?? []).map((t) => t.proof_path),
    ...mediations.map((m) => m.report_path),
  ].filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("case-files").createSignedUrls(paths, SIGNED_URL_SECONDS);
    data?.forEach((s) => s.path && s.signedUrl && signed.set(s.path, s.signedUrl));
  }
  // Exports sit in their own bucket; storage RLS only lets admins sign them.
  const exportPaths = exports.flatMap((e) => (e.output_path ? [e.output_path] : []));
  const exportUrls = new Map<string, string>();
  if (exportPaths.length) {
    const { data } = await supabase.storage.from("case-exports").createSignedUrls(exportPaths, SIGNED_URL_SECONDS);
    data?.forEach((s) => s.path && s.signedUrl && exportUrls.set(s.path, s.signedUrl));
  }

  const loan = one(c.loans);
  const branch = one(c.bank_branches) as { branch_name: string; ifsc: string | null; banks: Rel<{ name: string }> } | null;
  const claim = c.claim_amount_paise == null ? null : Number(c.claim_amount_paise);
  // The suit type follows the office's forum setting (admin); the case row already carries it.
  const check = claim == null ? null : { needs12A: c.needs_12a, isCommercial: c.is_commercial };
  const forum = claim == null ? null : recoveryForum({ claimPaise: claim, lenderIsBank: true });
  const isDrt = forum?.forum === "drt";
  const [statusLabel, statusTone] = caseStatus(c.status, t);
  const parties = [...(c.parties ?? [])].sort((a, b) => a.position - b.position);
  // The same papers the single buttons below offer, for "Generate all papers".
  const suitSet: { kind: DocKind; label: string }[] = isDrt
    ? [
        { kind: "demand_notice", label: "Demand notice" },
        { kind: "original_application", label: "DRT Original Application" },
      ]
    : [
        { kind: "demand_notice", label: "Demand notice" },
        { kind: "plaint", label: "Plaint" },
        { kind: "list_of_documents", label: "List of documents" },
        { kind: "vakalatnama", label: "Vakalatnama" },
        { kind: "affidavit", label: c.is_commercial ? "Statement of truth" : "Affidavit" },
        { kind: "address_memo", label: "Address memo" },
        ...(c.suit_type === "summary_o37" ? [{ kind: "draft_decree" as const, label: "Draft decree" }] : []),
        { kind: "bbe_certificate", label: "Bankers' Books certificate" },
        { kind: "court_fee_letter", label: "Court-fee letter" },
        { kind: "efiling_sheet", label: "E-filing data sheet" },
        ...(c.is_commercial && c.urgent_interim_relief ? [{ kind: "interim_application" as const, label: "Interim application" }] : []),
      ];

  return (
    <>
      <TopBar
        org={one(profile?.organizations as Rel<{ name: string }>)?.name}
        name={profile?.full_name}
        roles={roleNames}
      />
      <main className="w-full flex-1 lg:px-6 space-y-5 px-4 pb-16 pt-8">
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
          <Stepper status={c.status} needs12A={c.needs_12a} t={t} />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="glass-card fade-up p-6 md:col-span-1" style={{ animationDelay: "100ms" }}>
            <p className="label">Claim incl. interest</p>
            <p className="gradient-text mt-1 text-3xl font-semibold tracking-tight">{claim == null ? "—" : formatINR(claim)}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              {isDrt ? (
                <>
                  <Field label="DRT fee">{formatINR(forum!.feePaise!)}</Field>
                  <Field label="Forum">DRT · Original Application</Field>
                </>
              ) : (
                <>
                  <Field label="Court fee">{courtFee(claim, one(c.courts as Rel<{ state: string }>)?.state)}</Field>
                  <Field label="Sec 12A">{check?.needs12A ? "Required" : "Not required"}</Field>
                  <Field label="Suit type">
                    {check?.isCommercial ? "Commercial" : c.suit_type === "summary_o37" ? "Summary (O.37)" : "Ordinary"}
                  </Field>
                </>
              )}
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

        {(canEdit || (caseTasks?.length ?? 0) > 0) && (
          <Section title={t("Field tasks")} subtitle="Documents, notary, e-filing, dispatch — field staff update from their phone" delay={190}>
            {caseTasks?.length ? (
              <ul className="mb-4 space-y-2 text-sm">
                {caseTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2">
                    <span className={`pill ${t.status === "done" ? "pill-green" : t.status === "in_progress" ? "pill-amber" : "pill-neutral"}`}>
                      {title(t.status)}
                    </span>
                    <span className="font-medium">{title(t.kind)}</span>
                    <span className="muted">
                      {fieldStaff.find((p) => p.id === t.assignee_id)?.name ?? "—"}
                      {t.due_at ? ` · due ${fmtDate(t.due_at)}` : ""}
                    </span>
                    {t.note && <span>“{t.note}”</span>}
                    {t.proof_path && signed.get(t.proof_path) && (
                      <a className="btn px-2 py-0.5 text-xs" href={signed.get(t.proof_path)}>
                        ⬇ Proof
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {canEdit && <AssignTask caseId={c.id} fieldStaff={fieldStaff} />}
          </Section>
        )}

        <Section title={t("Team")} subtitle="Maker–checker: the approver can never be the drafter" delay={200}>
          {roleNames.includes("admin") ? (
            <AssignForm
              caseId={c.id}
              drafterId={c.assigned_drafter}
              approverId={c.assigned_approver}
              drafters={drafters}
              approvers={approvers}
            />
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Drafter">{nameOf(c.assigned_drafter)}</Field>
              <Field label="Approver">{nameOf(c.assigned_approver)}</Field>
            </dl>
          )}
          {roleNames.includes("admin") && (
            <div className="mt-5 flex flex-wrap items-start gap-3 border-t border-white/20 pt-4">
              <ExportCase caseId={c.id} />
              {exports.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-2 text-sm">
                  <span className={`pill ${JOB_TONE[e.status]}`}>{title(e.status)}</span>
                  {e.output_path && exportUrls.get(e.output_path) ? (
                    <a className="btn px-3 py-1 text-xs" href={exportUrls.get(e.output_path)}>
                      ⬇ {e.output_meta.fileName} · {((e.output_meta.bytes ?? 0) / 1048576).toFixed(1)} MB
                    </a>
                  ) : (
                    <span className="muted">{fmtDate(e.created_at)}</span>
                  )}
                  {e.error && <span className="text-red-600 dark:text-red-400">{e.error}</span>}
                </span>
              ))}
            </div>
          )}
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title={t("Demand notice dispatch")} subtitle="Record how and when the notice was sent" delay={220}>
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
            <Section title={t("Sec 12A pre-institution mediation")} subtitle="Mandatory before filing a commercial suit" delay={260}>
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
            <Section title={t("Sec 12A pre-institution mediation")} delay={260}>
              <p className="muted text-sm">Not required for this case.</p>
            </Section>
          )}
        </div>

        <Section title={`${t("Documents")} (${docs?.length ?? 0})`} subtitle="Scans are stored privately; links expire in 5 minutes" delay={300}>
          {canEdit && <UploadScan orgId={c.org_id} caseId={c.id} lang={lang} />}
          <ul className="mt-4 space-y-2">
            {docs?.map((d) => (
              <li key={d.id} className="row-hover flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
                <a className="min-w-0 flex-1 truncate py-1 hover:underline" href={signed.get(d.storage_path)} target="_blank" rel="noreferrer">
                  📄 {d.storage_path.split("/").pop()?.replace(/^\d+-/, "")}{" "}
                  <span className="muted">· {fmtDate(d.created_at)}</span>
                </a>
                {signed.get(d.storage_path) && (
                  <a className="btn px-3 py-1 text-xs" href={signed.get(d.storage_path)} target="_blank" rel="noreferrer">
                    👁 {t("Open scan")}
                  </a>
                )}
                <OcrControls
                  documentId={d.id}
                  caseId={c.id}
                  job={latestJob.get(`digitise:${d.id}`) ?? null}
                  extractJob={latestJob.get(`extract:${d.id}`) ?? null}
                  canEdit={canEdit}
                />
              </li>
            ))}
            {!docs?.length && <p className="muted text-sm">No scans uploaded yet.</p>}
          </ul>
        </Section>

        {reviewRows.length > 0 && (
          <Section
            title={t("Extracted data — review")}
            subtitle="Read from the scans by Sarvam. Check each value against the source, then verify. Only verified values reach the case."
            delay={320}
          >
            <ExtractionReview rows={reviewRows} caseId={c.id} canEdit={canEdit} lang={lang} />
          </Section>
        )}

        {canEdit && !isDrt && (
          <Section
            title={t("Suit particulars")}
            subtitle="Printed in the plaint, decree, list of documents and affidavit in the office format · amounts totalled in code"
            delay={330}
          >
            <SuitParticulars
              initial={{
                caseId: c.id,
                signatoryName: c.signatory_name ?? "",
                signatoryDesignation: c.signatory_designation ?? "",
                signatoryAge: c.signatory_age == null ? "" : String(c.signatory_age),
                penalInterest: c.penal_interest_paise == null ? "" : String(Number(c.penal_interest_paise) / 100),
                expenses: rupeesText(c.expenses_paise),
                parties: parties.map((p) => ({ id: p.id, throughCapacity: p.through_capacity ?? "", throughName: p.through_name ?? "" })),
                loans: [...(c.loans ?? [])]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((l) => ({
                    id: l.id,
                    applicationDate: isoToDot(l.application_date),
                    purpose: l.purpose ?? "",
                    tenureMonths: l.tenure_months == null ? "" : String(l.tenure_months),
                    executedDocs: formatDocumentLines(readExecutedDocs(l.executed_docs)),
                  })),
              }}
              partyNames={parties.map((p) => p.name)}
              loanNames={[...(c.loans ?? [])]
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .map((l) => `${l.facility_type ?? "Loan"}${l.account_last4 ? ` · A/c XXXX${l.account_last4}` : ""}`)}
            />
          </Section>
        )}

        <Section title={t("Drafts")} subtitle="Generated from verified case data · approval enforced by the database" delay={340}>
          {canEdit && (
            <div className="mb-4 flex flex-wrap items-start gap-3">
              <GenerateAll caseId={c.id} kinds={suitSet} lang={lang} />
              <SubmitAll
                lang={lang}
                // Returned papers go back one by one, after the approver's comments are dealt with.
                drafts={(drafts ?? []).filter((d) => d.status === "draft").map((d) => ({ id: d.id, label: title(d.doc_kind) }))}
              />
            </div>
          )}
          {canEdit && (
            <details className="group">
              <summary className="muted cursor-pointer text-sm">{t("Or generate one paper at a time")}</summary>
            <div className="mt-3 flex flex-wrap gap-3">
              <GenerateDraft caseId={c.id} kind="demand_notice" label="Generate demand notice" />
              {isDrt ? (
                <GenerateDraft caseId={c.id} kind="original_application" label="Generate DRT Original Application" />
              ) : (
                <>
                  <GenerateDraft caseId={c.id} kind="plaint" label="Generate plaint" />
                  <GenerateDraft caseId={c.id} kind="list_of_documents" label="Generate list of documents" />
                  <GenerateDraft caseId={c.id} kind="vakalatnama" label="Generate vakalatnama" />
                  <GenerateDraft
                    caseId={c.id}
                    kind="affidavit"
                    label={c.is_commercial ? "Generate statement of truth" : "Generate affidavit"}
                  />
                  <GenerateDraft caseId={c.id} kind="address_memo" label="Generate address memo" />
                  {c.suit_type === "summary_o37" && <GenerateDraft caseId={c.id} kind="draft_decree" label="Generate draft decree" />}
                  <GenerateDraft caseId={c.id} kind="bbe_certificate" label="Generate Bankers' Books certificate" />
                  <GenerateDraft caseId={c.id} kind="court_fee_letter" label="Generate court-fee letter to bank" />
                  <GenerateDraft caseId={c.id} kind="efiling_sheet" label="Generate e-filing data sheet" />
                  {c.is_commercial && c.urgent_interim_relief && (
                    <GenerateDraft caseId={c.id} kind="interim_application" label="Generate interim application" />
                  )}
                </>
              )}
            </div>
            </details>
          )}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {drafts?.map((d) => {
              const vs = [...(d.draft_versions ?? [])].sort((a, b) => b.version - a.version);
              const last = [...(d.approvals ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
              const [label, tone] = draftStatus(d.status, t);
              return (
                <div key={d.id} className="glass-card p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {title(d.doc_kind)} <span className="muted text-xs uppercase">{d.language}</span>
                    </span>
                    <span className={`pill ${tone}`}>{label}</span>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {vs.map((v, i) => {
                      const job = pdfJob(v.id);
                      return (
                        <li key={v.version} className="flex flex-wrap items-start gap-2">
                          <a className="btn px-3 py-1 text-xs" href={v.docx_path ? signed.get(v.docx_path) : undefined}>
                            ⬇ v{v.version} DOCX · {fmtDate(v.created_at)}
                          </a>
                          {v.docx_path && signed.get(v.docx_path) && (
                            <DraftPreview
                              url={signed.get(v.docx_path)!}
                              heading={`${c.case_no_internal} · ${title(d.doc_kind)} v${v.version}`}
                              lang={lang}
                            />
                          )}
                          {v.pdf_path ? (
                            <a className="btn px-3 py-1 text-xs" href={signed.get(v.pdf_path)}>
                              ⬇ PDF/A
                            </a>
                          ) : job && job.status !== "failed" ? (
                            <span className={`pill ${JOB_TONE[job.status]}`}>PDF {job.status}</span>
                          ) : (
                            canEdit && i === 0 && <MakePdf caseId={c.id} versionId={v.id} />
                          )}
                          {!v.pdf_path && job?.status === "failed" && <span className="pill pill-red">PDF failed</span>}
                        </li>
                      );
                    })}
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

        <Section
          title={t("E-filing bundle")}
          subtitle="Index → plaint → annexures → vakalatnama → affidavit / SOT · one PDF/A-2b, A4, bookmarked, ≤ 25 MB"
          delay={380}
        >
          {BUNDLE_READY.includes(c.status) ? (
            canEdit && (
              <BundleForm
                caseId={c.id}
                documents={(docs ?? []).map((d) => ({ id: d.id, name: d.storage_path.split("/").pop()!.replace(/^\d+-/, "") }))}
              />
            )
          ) : (
            <p className="muted text-sm">Available once the plaint is approved. Only approved drafts go into the bundle.</p>
          )}
          {bundles.length > 0 && (
            <ul className="mt-5 space-y-3">
              {bundles.map((b) => (
                <li key={b.id} className="glass-card p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`pill ${JOB_TONE[b.status]}`}>{title(b.status)}</span>
                    <span className="muted">{fmtDate(b.created_at)}</span>
                    {b.output_path && (
                      <a className="btn px-3 py-1 text-xs" href={signed.get(b.output_path)}>
                        ⬇ {b.output_meta.fileName} · {b.output_meta.pages} pages ·{" "}
                        {((b.output_meta.bytes ?? 0) / 1048576).toFixed(1)} MB
                      </a>
                    )}
                  </div>
                  {b.error && <p className="mt-2 text-red-600 dark:text-red-400">{b.error}</p>}
                  {b.output_meta.entries && (
                    <ol className="muted mt-2 space-y-0.5">
                      {b.output_meta.entries.map((e) => (
                        <li key={`${e.title}-${e.from}`}>
                          {e.mark ? `Exhibit ${e.mark} – ` : ""}
                          {e.title} · p. {e.from === e.to ? e.from : `${e.from}–${e.to}`}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="muted mt-4 text-xs">
            Built by the document worker. Sign with DSC / eSign and pay court fee on eCourts before filing.
          </p>
        </Section>
      </main>
    </>
  );
}

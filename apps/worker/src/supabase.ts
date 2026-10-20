import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PartyRole, SuitType } from "@civil-suits/templates";
import { suitTypeOf } from "@civil-suits/templates";
import type { CaseForBundle, Db, Job, Store } from "./jobs";
import type { Batch, IntakeDb } from "./intake";

const BUCKET = "case-files";

type Rel<T> = T | T[] | null;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Service-role client. The key lives only on the worker host, never in the browser or the repo. */
export function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function supabaseStore(sb: SupabaseClient): Store {
  return {
    async download(path, bucket = BUCKET) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) throw new Error("Could not read an input file");
      return Buffer.from(await data.arrayBuffer());
    },
    async upload(path, body, contentType, bucket = BUCKET) {
      const { error } = await sb.storage.from(bucket).upload(path, body, { contentType, upsert: false });
      if (error) throw new Error("Could not store the output file");
    },
  };
}

export function supabaseDb(sb: SupabaseClient): Db {
  return {
    async draftVersion(id) {
      const { data } = await sb.from("draft_versions").select("docx_path").eq("id", id).maybeSingle();
      return data?.docx_path ? { docxPath: data.docx_path } : null;
    },

    async caseForBundle(caseId) {
      const { data: c, error } = await sb
        .from("cases")
        .select(
          "case_no_internal, suit_type, is_commercial, courts(name, district), bank_branches(branch_name, banks(name)), parties(name, role, address, position), drafts(doc_kind, language, status, current_version, draft_versions(version, docx_path, pdf_path)), documents(id, storage_path)",
        )
        .eq("id", caseId)
        .single();
      if (error || !c) throw new Error("Case not found");

      const branch = one(c.bank_branches as Rel<{ branch_name: string; banks: Rel<{ name: string }> }>);
      const parties = [...((c.parties ?? []) as { name: string; role: PartyRole; address: string | null; position: number }[])].sort(
        (a, b) => a.position - b.position,
      );
      type DraftRow = {
        doc_kind: string;
        language: string;
        status: string;
        current_version: number;
        draft_versions: { version: number; docx_path: string | null; pdf_path: string | null }[];
      };
      const drafts = ((c.drafts ?? []) as DraftRow[]).flatMap((d) => {
        const v = d.draft_versions.find((x) => x.version === d.current_version);
        return d.status === "approved" && d.language === "en" && v?.docx_path
          ? [{ kind: d.doc_kind, docxPath: v.docx_path, pdfPath: v.pdf_path }]
          : [];
      });
      const documents = Object.fromEntries(
        ((c.documents ?? []) as { id: string; storage_path: string }[]).map((d) => [d.id, { storagePath: d.storage_path }]),
      );
      const court = one(c.courts as Rel<{ name: string; district: string }>);

      const out: CaseForBundle = {
        caseNo: c.case_no_internal,
        caption: {
          court,
          year: new Date().getUTCFullYear(),
          suitType: suitTypeOf(c as { suit_type: SuitType | null; is_commercial: boolean }),
          bank: { name: one(branch?.banks ?? null)?.name ?? "the Bank", branch: branch?.branch_name ?? "" },
          defendants: parties.map((p) => ({ name: p.name, role: p.role, address: p.address })),
        },
        drafts,
        documents,
      };
      return out;
    },

    async caseExport(caseId) {
      // Explicit columns: *_enc ciphertext and OCR text never leave in an export.
      const { data: c, error } = await sb
        .from("cases")
        .select(
          "case_no_internal, status, suit_type, claim_amount_paise, specified_value_paise, is_commercial, needs_12a, urgent_interim_relief, cnr_no, filing_no, created_at, " +
            "courts(name, district, court_type), bank_branches(branch_name, ifsc, banks(name)), " +
            "parties(role, position, name, father_name, address, aadhaar_last4), " +
            "loans(account_last4, facility_type, sanction_date, sanction_amount_paise, roi_bps, npa_date, outstanding_paise, interest_upto_date), " +
            "notices(dispatch_mode, tracking_no, sent_at, served_at), mediations(authority, applied_at, outcome, report_date, report_path), " +
            "drafts(doc_kind, language, status, current_version, draft_versions(version, docx_path, pdf_path, diff_summary, created_at), approvals(decision, comments, created_at)), " +
            "documents(storage_path, sha256, page_count, doc_type, created_at), filings(efiling_no, court_fee_paise, txn_id, filed_at, status), " +
            "doc_jobs(kind, status, output_path, created_at)",
        )
        .eq("id", caseId)
        .single();
      if (error || !c) throw new Error("Case not found");
      const row = c as unknown as Record<string, unknown> & {
        case_no_internal: string;
        documents: { storage_path: string }[] | null;
        drafts: { draft_versions: { docx_path: string | null; pdf_path: string | null }[] }[] | null;
        mediations: { report_path: string | null }[] | null;
        doc_jobs: { kind: string; status: string; output_path: string | null }[] | null;
      };
      const files = [
        ...(row.documents ?? []).map((d) => d.storage_path),
        ...(row.drafts ?? []).flatMap((d) => d.draft_versions.flatMap((v) => [v.docx_path, v.pdf_path])),
        ...(row.mediations ?? []).map((m) => m.report_path),
        // Earlier bundles, but not earlier exports (an export never contains another export).
        ...(row.doc_jobs ?? []).filter((j) => j.kind === "efiling_bundle" && j.status === "done").map((j) => j.output_path),
      ].filter((p): p is string => !!p);
      const { case_no_internal, ...tables } = row;
      return { caseNo: case_no_internal, tables, files };
    },

    async logUsage(job: Job, kind, qty, meta) {
      await sb.from("usage_events").insert({ org_id: job.org_id, case_id: job.case_id, kind, qty, cost_paise: 0, meta });
    },
  };
}

export async function claim(sb: SupabaseClient): Promise<Job | null> {
  const { data, error } = await sb.rpc("claim_doc_job");
  if (error) throw new Error(`claim failed: ${error.message}`);
  return ((data as Job[] | null) ?? [])[0] ?? null;
}

export async function complete(sb: SupabaseClient, id: string, path: string, meta: Record<string, unknown>) {
  const { error } = await sb.rpc("complete_doc_job", { job_id: id, out_path: path, meta });
  if (error) throw new Error(`complete failed: ${error.message}`);
}

export function supabaseIntakeDb(sb: SupabaseClient): IntakeDb {
  return {
    async savePages(batch, pages) {
      const { error: de } = await sb.from("batch_pages").delete().eq("batch_id", batch.id);
      if (de) throw new Error("Could not reset batch pages");
      const { error } = await sb.from("batch_pages").insert(
        pages.map((p) => ({
          org_id: batch.org_id,
          batch_id: batch.id,
          page_no: p.pageNo,
          class: p.class,
          class_confidence: p.confidence,
          account_last4: p.accountLast4,
          borrower_hint: p.borrower,
          group_no: p.group,
        })),
      );
      if (error) throw new Error("Could not save batch pages");
      const { error: ue } = await sb
        .from("batches")
        .update({ status: "review", page_count: pages.length, locked_at: null, error: null })
        .eq("id", batch.id);
      if (ue) throw new Error("Could not update batch");
    },

    async caseByNumber(orgId, caseNo) {
      const { data } = await sb.from("cases").select("id").eq("org_id", orgId).eq("case_no_internal", caseNo).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },

    async createCase(batch, group, caseNo) {
      const { data, error } = await sb
        .from("cases")
        .insert({ org_id: batch.org_id, case_no_internal: caseNo, status: "docs_uploaded", created_by: batch.created_by })
        .select("id")
        .single();
      if (error || !data) throw new Error("Could not create case");
      // Record it at once, so a retry reuses this case instead of refusing the number.
      const { data: cur } = await sb.from("batches").select("created_cases").eq("id", batch.id).single();
      const created = { ...((cur?.created_cases as Record<string, string>) ?? {}), [String(group)]: data.id as string };
      const { error: ue } = await sb.from("batches").update({ created_cases: created }).eq("id", batch.id);
      if (ue) throw new Error("Could not record the created case");
      return data.id as string;
    },

    async caseInOrg(orgId, caseId) {
      const { data } = await sb.from("cases").select("id").eq("id", caseId).eq("org_id", orgId).maybeSingle();
      return !!data;
    },

    async addDocument(batch, caseId, path, sha256, pages) {
      const { data: existing } = await sb.from("documents").select("id").eq("storage_path", path).maybeSingle();
      if (existing) return;
      const { error } = await sb.from("documents").insert({
        org_id: batch.org_id,
        case_id: caseId,
        batch_id: batch.id,
        storage_path: path,
        sha256,
        page_count: pages,
        doc_type: "scan",
        uploaded_by: batch.created_by,
      });
      if (error) throw new Error("Could not record the case scan");
    },

    async markApplied(batch) {
      const { error } = await sb.from("batches").update({ status: "applied", locked_at: null, error: null }).eq("id", batch.id);
      if (error) throw new Error("Could not update batch");
    },
  };
}

export async function claimBatch(sb: SupabaseClient): Promise<(Batch & { attempts: number }) | null> {
  const { data, error } = await sb.rpc("claim_batch");
  if (error) throw new Error(`claim_batch failed: ${error.message}`);
  return ((data as (Batch & { attempts: number })[] | null) ?? [])[0] ?? null;
}

/** Back to the queue for another attempt, or failed after the third. */
export async function failBatch(sb: SupabaseClient, batch: Batch & { attempts: number }, message: string) {
  const retry = batch.attempts < 3;
  await sb
    .from("batches")
    .update({
      status: retry ? (batch.status === "splitting" ? "uploaded" : "applying") : "failed",
      locked_at: null,
      error: message.slice(0, 300),
    })
    .eq("id", batch.id);
}

/** Bulk-intake originals hold many borrowers' files; removed 7 days after the batch closes. */
export async function purgeBatchOriginals(sb: SupabaseClient, days = Number(process.env.BATCH_KEEP_DAYS ?? 7)): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  // Abandoned uploads (never reviewed or confirmed) go after 30 days.
  const staleCutoff = new Date(Date.now() - Math.max(days, 30) * 86_400_000).toISOString();
  const [{ data: closed }, { data: stale }] = await Promise.all([
    sb.from("batches").select("id, storage_path").in("status", ["applied", "failed"]).is("purged_at", null).lt("updated_at", cutoff).limit(100),
    sb.from("batches").select("id, storage_path").in("status", ["uploaded", "review"]).is("purged_at", null).lt("updated_at", staleCutoff).limit(100),
  ]);
  let removed = 0;
  for (const b of [...(closed ?? []), ...(stale ?? [])] as { id: string; storage_path: string }[]) {
    const { error } = await sb.storage.from("case-batches").remove([b.storage_path]);
    if (error) continue;
    // Page proposals hold borrower names and last-4 digits; they go with the file.
    await sb.from("batch_pages").delete().eq("batch_id", b.id);
    await sb.from("batches").update({ purged_at: new Date().toISOString(), status: "failed", error: "Purged" }).eq("id", b.id);
    removed++;
  }
  return removed;
}

/** Case exports carry every file and party name of a case; they are removed after `days`. */
export async function expireExports(sb: SupabaseClient, days = Number(process.env.EXPORT_KEEP_DAYS ?? 7)): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await sb
    .from("doc_jobs")
    .select("id, output_path, output_meta")
    .eq("kind", "case_export")
    .eq("status", "done")
    .not("output_path", "is", null)
    .lt("created_at", cutoff)
    .limit(100);
  let removed = 0;
  for (const j of (data ?? []) as { id: string; output_path: string; output_meta: Record<string, unknown> }[]) {
    const { error } = await sb.storage.from("case-exports").remove([j.output_path]);
    if (error) continue;
    await sb.from("doc_jobs").update({ output_path: null, output_meta: { ...j.output_meta, expired: true } }).eq("id", j.id);
    removed++;
  }
  return removed;
}

export async function fail(sb: SupabaseClient, id: string, err: string) {
  await sb.rpc("fail_doc_job", { job_id: id, err });
}

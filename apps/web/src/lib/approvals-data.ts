import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { InboxPaper } from "./approvals-inbox";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Row = {
  id: string;
  doc_kind: string;
  language: string;
  status: "in_approval" | "returned";
  created_by: string;
  current_version: number;
  updated_at: string;
  case_id: string;
  cases: Rel<{ case_no_internal: string; assigned_approver: string | null; parties: { name: string; position: number }[] | null }>;
  draft_versions: { version: number; created_by: string; diff_summary: string | null; docx_path: string | null }[] | null;
  approvals: { decision: "approved" | "returned"; comments: string | null; approver_id: string; created_at: string }[] | null;
};

/** What a hand-made version changed, as its author wrote it (the note stored with the version). */
export const changeNote = (summary: string | null | undefined) =>
  summary?.match(/^(?:Corrected by hand|Edited in Civil Suits[^:]*): (.+)$/)?.[1] ?? null;

export type LoadedPaper = InboxPaper & { docxPath: string | null };

/**
 * Every paper that is in approval or was sent back, on cases that are not archived. RLS decides
 * which rows come back (approver and admin: the office's; drafter: their cases'), exactly as on
 * the case page.
 */
export async function loadInboxPapers(supabase: Supabase): Promise<LoadedPaper[]> {
  const { data } = await supabase
    .from("drafts")
    .select(
      "id, doc_kind, language, status, created_by, current_version, updated_at, case_id, cases!inner(case_no_internal, archived_at, assigned_approver, parties(name, position)), draft_versions(version, created_by, diff_summary, docx_path), approvals(decision, comments, approver_id, created_at)",
    )
    .in("status", ["in_approval", "returned"])
    .is("cases.archived_at", null)
    .limit(500);

  return ((data ?? []) as unknown as Row[]).map((d) => {
    const c = one(d.cases);
    const versions = d.draft_versions ?? [];
    const latest = versions.find((v) => v.version === d.current_version) ?? null;
    const lastDecision = [...(d.approvals ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    return {
      id: d.id,
      caseId: d.case_id,
      caseNo: c?.case_no_internal ?? "",
      borrower: [...(c?.parties ?? [])].sort((a, b) => a.position - b.position)[0]?.name ?? "",
      docKind: d.doc_kind,
      language: d.language,
      status: d.status,
      makers: [...new Set([d.created_by, ...versions.map((v) => v.created_by)])],
      version: d.current_version,
      note: changeNote(latest?.diff_summary),
      // In approval: when it was sent. Sent back: when the approver decided.
      since: d.status === "returned" && lastDecision ? lastDecision.created_at : d.updated_at,
      assignedApprover: c?.assigned_approver ?? null,
      last: lastDecision
        ? { decision: lastDecision.decision, comments: lastDecision.comments, by: lastDecision.approver_id, at: lastDecision.created_at }
        : null,
      docxPath: latest?.docx_path ?? null,
    };
  });
}

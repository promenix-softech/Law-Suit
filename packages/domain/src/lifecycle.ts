/** Mirrors the `case_status` enum in supabase/migrations. Keep both in sync. */
export const CASE_STATUSES = [
  "bank_call",
  "case_created",
  "docs_uploaded",
  "extraction_review",
  "notice_generated",
  "notice_sent",
  "mediation_12a",
  "drafting",
  "in_approval",
  "approved",
  "notary_stamp",
  "efiling_ready",
  "filed",
  "listed",
  "disposed",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

const NEXT: Record<CaseStatus, readonly CaseStatus[]> = {
  bank_call: ["case_created"],
  case_created: ["docs_uploaded"],
  docs_uploaded: ["extraction_review"],
  extraction_review: ["notice_generated", "drafting"],
  notice_generated: ["notice_sent"],
  notice_sent: ["mediation_12a", "drafting"],
  mediation_12a: ["drafting"],
  drafting: ["in_approval"],
  in_approval: ["approved", "drafting"],
  approved: ["notary_stamp"],
  notary_stamp: ["efiling_ready"],
  efiling_ready: ["filed"],
  filed: ["listed"],
  listed: ["disposed"],
  disposed: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus, opts: { needs12A?: boolean } = {}): boolean {
  if (!NEXT[from].includes(to)) return false;
  // A commercial suit needing 12A cannot skip mediation on its way to drafting.
  if (opts.needs12A && from === "notice_sent" && to === "drafting") return false;
  return true;
}

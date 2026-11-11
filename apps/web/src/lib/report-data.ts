import "server-only";

import { DISPOSAL_LABEL, type Disposal } from "@civil-suits/domain";
import type { createClient } from "./supabase/server";
import type { ReportCase } from "./report";
import { caseStatus, todayIST } from "./ui";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export interface ReportData {
  banks: { id: string; name: string }[];
  /** Cases of the chosen bank (all banks when none is chosen), in case-number order. */
  rows: (ReportCase & { id: string; bankId: string | null })[];
}

/**
 * The cases the signed-in person may see (RLS), shaped for the status report. Archived cases are
 * left out. `bankId` narrows to one bank.
 */
export async function loadReport(supabase: Supabase, bankId: string | null): Promise<ReportData> {
  const [{ data: cases }, { data: hearings }] = await Promise.all([
    supabase
      .from("cases")
      .select(
        "id, case_no_internal, status, created_at, claim_amount_paise, cnr_no, disposal, parties(name, position), bank_branches(branch_name, banks(id, name)), loans(account_last4, created_at), notices(sent_at), filings(filed_at, status)",
      )
      .is("archived_at", null)
      .order("case_no_internal"),
    supabase.from("hearings").select("case_id, hearing_date").is("outcome", null).gte("hearing_date", todayIST()).order("hearing_date"),
  ]);

  const nextHearing = new Map<string, string>();
  (hearings ?? []).forEach((h) => {
    if (!nextHearing.has(h.case_id)) nextHearing.set(h.case_id, h.hearing_date);
  });

  const all = (cases ?? []).map((c) => {
    const branch = one(c.bank_branches as Rel<{ branch_name: string; banks: Rel<{ id: string; name: string }> }>);
    const bank = one(branch?.banks ?? null);
    const borrower = [...(c.parties ?? [])].sort((a, b) => a.position - b.position)[0]?.name ?? "";
    const loan = [...(c.loans ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const sent = (c.notices ?? []).map((n) => n.sent_at).filter(Boolean).sort().at(-1) ?? null;
    const filed = (c.filings ?? []).filter((f) => f.status === "filed").map((f) => f.filed_at).filter(Boolean).sort().at(-1) ?? null;
    const istDate = (ts: string | null) => (ts ? new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : null);
    return {
      id: c.id as string,
      bankId: bank?.id ?? null,
      caseNo: c.case_no_internal as string,
      borrower,
      bank: bank?.name ?? "",
      branch: branch?.branch_name ?? "",
      accountLast4: loan?.account_last4 ?? null,
      claimPaise: c.claim_amount_paise == null ? null : Number(c.claim_amount_paise),
      stage: caseStatus(c.status)[0],
      openedOn: istDate(c.created_at) ?? "",
      noticeSentOn: istDate(sent),
      filedOn: istDate(filed),
      cnr: c.cnr_no ?? null,
      nextHearingOn: nextHearing.get(c.id) ?? null,
      disposal: c.disposal ? (DISPOSAL_LABEL[c.disposal as Disposal] ?? c.disposal) : null,
    };
  });

  const banks = [...new Map(all.filter((r) => r.bankId).map((r) => [r.bankId!, { id: r.bankId!, name: r.bank }])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { banks, rows: bankId ? all.filter((r) => r.bankId === bankId) : all };
}

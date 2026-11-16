import "server-only";
import { schemeStatus, schemeYearEnd, type SchemeStatus, type SchemeTerms, type SchemeUsage } from "@civil-suits/domain";
import type { createClient } from "@/lib/supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/** A row of office_scheme_state(): an office, its scheme (if any) and its counts. No case content. */
type StateRow = {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  is_platform: boolean;
  scheme_name: string | null;
  period: "monthly" | "yearly" | null;
  cases_per_month: number | null;
  cases_per_year: number | null;
  valid_from: string | null;
  valid_until: string | null;
  on_limit: "warn" | "block" | null;
  ai_jobs_per_day: number | null;
  seats: number | null;
  note: string | null;
  scheme_updated_at: string | null;
  today: string;
  year_start: string;
  users: number;
  cases_total: number;
  cases_month: number;
  cases_year: number;
  ai_jobs_today: number;
  ai_pages_month: number;
  last_case_at: string | null;
};

export type Office = {
  id: string;
  name: string;
  firmCode: string | null;
  createdAt: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  /** The super admin's own office: it has no scheme to enforce and cannot be paused. */
  isPlatform: boolean;
  terms: SchemeTerms | null;
  note: string | null;
  schemeUpdatedAt: string | null;
  usage: SchemeUsage;
  yearEnd: string;
  casesTotal: number;
  aiPagesMonth: number;
  lastCaseAt: string | null;
  status: SchemeStatus;
};

export type MonthUsage = { month: string; cases: number; suitPacks: number; aiPages: number; aiCostPaise: number };

function toOffice(r: StateRow): Office {
  const terms: SchemeTerms | null =
    r.scheme_name && r.period && r.valid_from && r.on_limit
      ? {
          schemeName: r.scheme_name,
          period: r.period,
          casesPerMonth: r.cases_per_month,
          casesPerYear: r.cases_per_year,
          validFrom: r.valid_from,
          validUntil: r.valid_until,
          onLimit: r.on_limit,
          aiJobsPerDay: r.ai_jobs_per_day,
          seats: r.seats,
        }
      : null;
  const usage: SchemeUsage = {
    today: r.today,
    yearStart: r.year_start,
    casesMonth: Number(r.cases_month),
    casesYear: Number(r.cases_year),
    users: Number(r.users),
    aiJobsToday: Number(r.ai_jobs_today),
  };
  return {
    id: r.id,
    name: r.name,
    firmCode: r.slug,
    createdAt: r.created_at,
    suspendedAt: r.suspended_at,
    suspendedReason: r.suspended_reason,
    isPlatform: r.is_platform,
    terms,
    note: r.note,
    schemeUpdatedAt: r.scheme_updated_at,
    usage,
    yearEnd: schemeYearEnd(r.year_start),
    casesTotal: Number(r.cases_total),
    aiPagesMonth: Number(r.ai_pages_month),
    lastCaseAt: r.last_case_at,
    status: schemeStatus(terms, usage),
  };
}

/** Whether the signed-in person is a super admin (the database decides; this only asks). */
export async function isPlatformAdmin(supabase: Supabase): Promise<boolean> {
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
}

/** Every office with its scheme and counts — empty unless the caller is a super admin. */
export async function loadOffices(supabase: Supabase): Promise<Office[]> {
  const { data } = await supabase.rpc("office_scheme_state");
  return ((data ?? []) as StateRow[]).map(toOffice);
}

/** One office: for the super admin, or for that office's own admin. Null for anyone else. */
export async function loadOffice(supabase: Supabase, orgId: string): Promise<Office | null> {
  const { data } = await supabase.rpc("office_scheme_state", { p_org: orgId });
  const row = ((data ?? []) as StateRow[])[0];
  return row ? toOffice(row) : null;
}

/** Usage month by month, oldest first (the same permission as `loadOffice`). */
export async function loadMonthlyUsage(supabase: Supabase, orgId: string, months = 12): Promise<MonthUsage[]> {
  const { data } = await supabase.rpc("office_usage_monthly", { p_org: orgId, p_months: months });
  type Row = { month: string; cases: number; suit_packs: number; ai_pages: number; ai_cost_paise: number };
  return ((data ?? []) as Row[]).map((r) => ({
    month: r.month,
    cases: Number(r.cases),
    suitPacks: Number(r.suit_packs),
    aiPages: Number(r.ai_pages),
    aiCostPaise: Number(r.ai_cost_paise),
  }));
}

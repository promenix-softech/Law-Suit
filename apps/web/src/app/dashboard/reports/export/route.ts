import { z } from "zod";
import { REPORT_COLUMNS, reportRow, toCsv } from "@/lib/report";
import { loadReport } from "@/lib/report-data";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/ui";

/**
 * The status report as a CSV for Excel. It holds only what the signed-in person can already see
 * on screen (RLS); field staff, who do not see case files, get nothing. Never cached.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return new Response("Not configured", { status: 503 });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Sign in first", { status: 401 });

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", auth.user.id);
  const names = (roles ?? []).map((r) => r.role as string);
  if (!names.some((r) => r === "admin" || r === "approver" || r === "drafter")) return new Response("Not allowed", { status: 403 });

  const bank = new URL(request.url).searchParams.get("bank");
  if (bank && !z.uuid().safeParse(bank).success) return new Response("Not found", { status: 404 });

  const { rows } = await loadReport(supabase, bank);
  return new Response(toCsv(REPORT_COLUMNS, rows.map(reportRow)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="case-status-${todayIST()}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

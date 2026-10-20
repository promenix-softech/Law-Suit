import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
export type Person = { id: string; name: string };

/** Org members holding a role, for assignment pickers (RLS limits rows to the caller's org). */
export async function peopleWithRole(supabase: Supabase, role: "drafter" | "approver" | "field"): Promise<Person[]> {
  const { data } = await supabase.from("user_roles").select("user_id").eq("role", role);
  const ids = (data ?? []).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids).order("full_name");
  return (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}

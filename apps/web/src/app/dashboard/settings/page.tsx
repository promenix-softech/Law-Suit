import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { loadOfficeConfig, OFFICE_CONFIG_ERROR } from "@/lib/office-profile";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm, type SettingsFormValues } from "./settings-form";

export const metadata = { title: "Office settings — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Admin-only: the office's details and drafting choices (forum, margins, notice terms). */
export default async function SettingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: roles }, config] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    loadOfficeConfig(supabase),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!roleNames.includes("admin") || !profile) redirect("/dashboard");
  if (!config) throw new Error(OFFICE_CONFIG_ERROR);

  const p = config.profile;
  const initial: SettingsFormValues = {
    firmName: p?.firmName ?? one(profile.organizations as Rel<{ name: string }>)?.name ?? "",
    firmTagline: p?.firmTagline ?? "",
    advocateCode: p?.advocateCode ?? "",
    sanadNo: p?.sanadNo ?? "",
    address: p?.address ?? "",
    contact: p?.contact ?? "",
    email: p?.email ?? "",
    advocates: (p?.advocates ?? []).join("\n"),
    accountName: p?.feeAccount?.accountName ?? "",
    accountNo: p?.feeAccount?.accountNo ?? "",
    accountType: p?.feeAccount?.accountType ?? "",
    bank: p?.feeAccount?.bank ?? "",
    branch: p?.feeAccount?.branch ?? "",
    ifsc: p?.feeAccount?.ifsc ?? "",
    pan: p?.pan ?? "",
    refPrefix: p?.refPrefix ?? "",
    noticeDays: String(p?.noticeDays ?? 7),
    noticeFeeRupees: p?.noticeFeeRupees == null ? "" : String(p.noticeFeeRupees),
    forum: config.settings.forum,
    margins: config.settings.margins,
  };

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 pb-16 pt-8">
        <div className="fade-up">
          <Link href="/dashboard" className="muted text-sm hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Office settings</h1>
          <p className="muted mt-1 text-sm">
            Seen and changed by office admins only; drafters and approvers get these values in the papers, field staff never see them. Every change is in the audit log.
          </p>
        </div>
        <SettingsForm initial={initial} />
      </main>
    </>
  );
}

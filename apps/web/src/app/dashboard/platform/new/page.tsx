import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { getT } from "@/lib/lang";
import { isPlatformAdmin } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import { NewOfficeForm } from "./new-office-form";

export const metadata = { title: "New office — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** The super admin opens a new office (firm) and invites its first admin. */
export default async function NewOfficePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  if (!(await isPlatformAdmin(supabase))) notFound();
  const { lang, t } = await getT();

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
  ]);
  if (!profile) redirect("/login");

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={(roles ?? []).map((r) => r.role as string)} />
      <main className="w-full flex-1 space-y-6 px-4 pb-16 pt-8 lg:px-6">
        <div className="fade-up">
          <Link href="/dashboard/platform" className="muted text-sm hover:underline">
            ← {t("All offices")}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("New office")}</h1>
          <p className="muted mt-1 text-sm">{t("Open a new firm on Civil Suits and invite its admin. Set its scheme on the next page.")}</p>
        </div>
        <NewOfficeForm lang={lang} />
      </main>
    </>
  );
}

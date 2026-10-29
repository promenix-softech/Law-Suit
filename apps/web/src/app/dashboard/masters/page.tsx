import { redirect } from "next/navigation";
import { STATE_NAMES } from "@civil-suits/domain";
import { TopBar } from "@/components/top-bar";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { BranchForm, CourtForm, EditableRow, type BranchRow, type CourtRow } from "./master-forms";

export const metadata = { title: "Banks & courts — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const COURT_TYPE = { civil: "Civil court", commercial: "Commercial court", drt: "DRT" } as const;

/** Admin-only masters: the banks, branches and courts the new-case form offers. */
export default async function MastersPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { lang, t } = await getT();

  const [{ data: profile }, { data: roles }, { data: branches }, { data: courts }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("bank_branches").select("id, branch_name, ifsc, address, banks(name, short_code)").order("branch_name"),
    supabase.from("courts").select("id, name, district, court_type, state").order("name"),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!roleNames.includes("admin")) redirect("/dashboard");

  const branchRows: BranchRow[] = (branches ?? []).map((b) => {
    const bank = one(b.banks as Rel<{ name: string; short_code: string }>);
    return { id: b.id, bankName: bank?.name ?? "", shortCode: bank?.short_code ?? "", branchName: b.branch_name, ifsc: b.ifsc ?? "", address: b.address ?? "" };
  });
  const banks = [...new Map(branchRows.map((b) => [b.shortCode, { name: b.bankName, shortCode: b.shortCode }])).values()];
  const courtRows: CourtRow[] = (courts ?? []).map((c) => ({ id: c.id, name: c.name, district: c.district, courtType: c.court_type, state: c.state }));
  const states = Object.entries(STATE_NAMES) as [string, string][];

  return (
    <>
      <TopBar org={one(profile?.organizations as Rel<{ name: string }>)?.name} name={profile?.full_name} roles={roleNames} />
      <main className="w-full flex-1 space-y-5 px-4 pb-16 pt-8 lg:px-6">
        <div className="fade-up">
          <h1 className="text-3xl font-semibold tracking-tight">{t("Banks & courts")}</h1>
          <p className="muted mt-1 text-sm">
            {t("Branches and courts added here appear in the new-case form and are printed in the papers. Only admins can change them.")}
          </p>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-2">
          <section className="glass-card fade-up space-y-5 p-6">
            <h2 className="text-lg font-semibold">
              {t("Bank branches")} <span className="muted text-sm">({branchRows.length})</span>
            </h2>
            <BranchForm banks={banks} lang={lang} />
            <ul className="space-y-1 border-t border-current/10 pt-4">
              {branchRows.map((b) => (
                <EditableRow
                  key={b.id}
                  lang={lang}
                  summary={
                    <>
                      <span className="font-semibold">{b.shortCode}</span> — {b.branchName}
                      {b.ifsc && <span className="muted"> · {b.ifsc}</span>}
                      {b.address && <p className="muted text-xs">{b.address}</p>}
                    </>
                  }
                >
                  <BranchForm banks={banks} edit={b} lang={lang} />
                </EditableRow>
              ))}
              {!branchRows.length && <p className="muted text-sm">{t("No branches yet.")}</p>}
            </ul>
          </section>

          <section className="glass-card fade-up space-y-5 p-6" style={{ animationDelay: "80ms" }}>
            <h2 className="text-lg font-semibold">
              {t("Courts")} <span className="muted text-sm">({courtRows.length})</span>
            </h2>
            <CourtForm states={states} lang={lang} />
            <ul className="space-y-1 border-t border-current/10 pt-4">
              {courtRows.map((c) => (
                <EditableRow
                  key={c.id}
                  lang={lang}
                  summary={
                    <>
                      <span className="font-semibold">{c.name}</span>
                      <span className="muted">
                        {" "}
                        · {t(COURT_TYPE[c.courtType])} · {c.district}, {c.state}
                      </span>
                    </>
                  }
                >
                  <CourtForm states={states} edit={c} lang={lang} />
                </EditableRow>
              ))}
              {!courtRows.length && <p className="muted text-sm">{t("No courts yet.")}</p>}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}

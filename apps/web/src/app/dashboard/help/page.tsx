import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "How it works — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Who does a step; a person sees "Your part" on the steps of the roles they hold. */
type Who = "admin" | "drafter" | "approver" | "field";

const STEPS: { who: Who[]; title: string; text: string }[] = [
  { who: ["admin"], title: "Open a case", text: "Choose the bank branch and the court, add the borrower, and name a drafter and an approver." },
  { who: ["drafter"], title: "Upload the bank's loan file", text: "Scan the bank's papers and upload them. AI reads them in about a minute." },
  { who: ["drafter"], title: "Check what AI read", text: "Compare each value with the scan and verify it. Only verified values are used in the papers." },
  { who: ["drafter", "field"], title: "Demand notice", text: "Generate the notice, send it, and record how and when it was sent." },
  { who: ["drafter"], title: "Suit papers", text: "Fill the suit particulars, then generate all the papers with one button and send them for approval." },
  { who: ["approver"], title: "Approval", text: "Read each paper and approve it, or send it back with a comment. Nobody can approve a paper they wrote." },
  { who: ["drafter", "field"], title: "Notary and e-filing", text: "Build the e-filing bundle, get the notary work done, file on eCourts and record the filing." },
  { who: ["drafter"], title: "In court", text: "Add the CNR, then each hearing date and what happened, until the suit is disposed." },
];

const TIPS = [
  "Every case shows its one next step at the top. Start there.",
  "The simple view shows only what you need now. “Show everything” opens the full page.",
  "Press Ctrl K to find a case by its number, the borrower or the CNR.",
  "Amounts, interest, court fee and dates are calculated by the program, never by AI.",
  "Cases are never deleted. An admin can archive a case and restore it later.",
];

const WHO_LABEL: Record<Who, string> = { admin: "Admin", drafter: "Drafter", approver: "Approver", field: "Field staff" };

/** A one-page guide for someone opening the app for the first time. */
export default async function HelpPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { t } = await getT();

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", auth.user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  const fieldOnly = roleNames.length > 0 && roleNames.every((r) => r === "field");

  return (
    <>
      <TopBar org={one(profile?.organizations as Rel<{ name: string }>)?.name} name={profile?.full_name} roles={roleNames} />
      <main className="w-full max-w-4xl flex-1 space-y-6 px-4 pb-16 pt-8 lg:px-6">
        <div className="fade-up">
          <h1 className="text-3xl font-semibold tracking-tight">{t("How it works")}</h1>
          <p className="muted mt-1 text-sm">{t("A case moves through eight steps. The app always shows which one is next and whose turn it is.")}</p>
        </div>

        <ol className="space-y-3">
          {STEPS.map((s, i) => {
            const mine = s.who.some((w) => roleNames.includes(w));
            return (
              <li
                key={s.title}
                className={`glass-card fade-up flex gap-4 p-5 ${mine ? "ring-1 ring-violet-400/50" : ""}`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                    mine ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white" : "border border-current/20"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {t(s.title)}
                    {mine && <span className="pill pill-violet">{t("Your part")}</span>}
                  </p>
                  <p className="mt-0.5 text-sm">{t(s.text)}</p>
                  <p className="muted mt-1 text-xs">{s.who.map((w) => t(WHO_LABEL[w])).join(" · ")}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <section className="glass-card fade-up p-5">
          <h2 className="text-lg font-semibold">{t("Good to know")}</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
            {TIPS.map((tip) => (
              <li key={tip}>{t(tip)}</li>
            ))}
          </ul>
        </section>

        <Link href={fieldOnly ? "/dashboard/tasks" : "/dashboard"} className="btn btn-primary inline-flex px-4 py-2 text-sm">
          {fieldOnly ? t("Go to my tasks") : t("Go to my cases")} →
        </Link>
      </main>
    </>
  );
}

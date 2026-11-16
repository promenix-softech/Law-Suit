import Link from "next/link";
import { redirect } from "next/navigation";
import { formatINR } from "@civil-suits/domain";
import { DraftPreview } from "@/components/draft-preview";
import { TopBar } from "@/components/top-bar";
import { loadInboxPapers, type LoadedPaper } from "@/lib/approvals-data";
import { buildInbox, daysBetween, waitTone } from "@/lib/approvals-inbox";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { createClient } from "@/lib/supabase/server";
import { docLabel, fmtDate } from "@/lib/ui";
import { InboxDecision } from "./inbox-controls";

export const metadata = { title: "Approvals — Civil Suits" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type CaseFacts = {
  id: string;
  claim_amount_paise: number | null;
  assigned_drafter: string | null;
  courts: Rel<{ name: string }>;
  bank_branches: Rel<{ branch_name: string; banks: Rel<{ name: string }> }>;
};
type Decided = {
  id: string;
  decision: "approved" | "returned";
  comments: string | null;
  created_at: string;
  drafts: Rel<{ doc_kind: string; language: string; case_id: string; cases: Rel<{ case_no_internal: string }> }>;
};

const waited = (days: number, t: T) => (days === 0 ? t("Today") : days === 1 ? t("1 day") : `${days} ${t("days")}`);
const paperName = (p: { docKind: string; language: string }, t: T) => `${t(docLabel(p.docKind))}${p.language === "mr" ? ` (${t("Marathi")})` : ""}`;

/**
 * Approvals, on a page of their own: what waits for my decision (read it, approve it or send it
 * back, right here), what came back to me, and what I sent on. Which papers appear is decided by
 * RLS; whether an approval is allowed is decided by the database (maker–checker).
 */
export default async function ApprovalsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const me = auth.user.id;
  const { lang, t } = await getT();

  const [{ data: profile }, { data: roles }, papers, { data: people }, { data: decidedRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", me).single(),
    supabase.from("user_roles").select("role").eq("user_id", me),
    loadInboxPapers(supabase),
    supabase.from("profiles").select("id, full_name"),
    supabase
      .from("approvals")
      .select("id, decision, comments, created_at, drafts(doc_kind, language, case_id, cases(case_no_internal))")
      .eq("approver_id", me)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  if (!profile) redirect("/login");
  const roleNames = (roles ?? []).map((r) => r.role as string);
  // Field staff work their tasks; papers are for drafters, approvers and admins.
  if (roleNames.length > 0 && roleNames.every((r) => r === "field")) redirect("/dashboard/tasks");
  const canApprove = roleNames.includes("approver") || roleNames.includes("admin");

  const inbox = buildInbox(papers, me, canApprove);
  const toDecideCount = inbox.toDecide.reduce((n, g) => n + g.papers.length, 0);
  const nameOf = (id: string | null | undefined) => (people ?? []).find((p) => p.id === id)?.full_name ?? "—";
  const now = new Date();

  // Facts about the cases to decide, and short-lived links to read their papers.
  const caseIds = inbox.toDecide.map((g) => g.caseId);
  const docxPaths = inbox.toDecide.flatMap((g) => g.papers.map((p) => (p as LoadedPaper).docxPath)).filter((p): p is string => !!p);
  const [{ data: caseRows }, { data: links }] = await Promise.all([
    caseIds.length
      ? supabase.from("cases").select("id, claim_amount_paise, assigned_drafter, courts(name), bank_branches(branch_name, banks(name))").in("id", caseIds)
      : Promise.resolve({ data: [] }),
    docxPaths.length ? supabase.storage.from("case-files").createSignedUrls(docxPaths, 300) : Promise.resolve({ data: [] }),
  ]);
  const facts = new Map(((caseRows ?? []) as unknown as CaseFacts[]).map((c) => [c.id, c]));
  const signed = new Map((links ?? []).filter((l) => l.path && l.signedUrl).map((l) => [l.path as string, l.signedUrl]));
  const decided = (decidedRows ?? []) as unknown as Decided[];

  const nothing = !toDecideCount && !inbox.returnedToMe.length && !inbox.myWaiting.length && !inbox.returnedByMe.length;

  return (
    <>
      <TopBar org={one(profile.organizations as Rel<{ name: string }>)?.name} name={profile.full_name} roles={roleNames} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 pb-16 pt-6">
        <div className="fade-up">
          <Link href="/dashboard" className="muted text-sm hover:underline">
            ← {t("Dashboard")}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("Approvals")}</h1>
          <p className="muted mt-1 text-sm">
            {canApprove
              ? t("Read each paper here, then approve it or send it back with the reason. Nobody approves a paper they wrote.")
              : t("Where your papers are: with the approver, or back with you to fix.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {canApprove && (
              <a href="#to-decide" className={`pill ${toDecideCount ? "pill-amber" : "pill-neutral"}`}>
                {t("For my decision")}: {toDecideCount}
              </a>
            )}
            <a href="#returned-to-me" className={`pill ${inbox.returnedToMe.length ? "pill-red" : "pill-neutral"}`}>
              {t("Sent back to me")}: {inbox.returnedToMe.length}
            </a>
            <a href="#my-waiting" className="pill pill-neutral">
              {t("My papers with the approver")}: {inbox.myWaiting.length}
            </a>
          </div>
        </div>

        {nothing && (
          <section className="glass-card fade-up p-8 text-center">
            <p className="text-3xl">✓</p>
            <p className="mt-2 font-semibold">{t("Nothing is waiting for you.")}</p>
            <p className="muted mt-1 text-sm">{t("New requests appear here as soon as a paper is sent for approval.")}</p>
          </section>
        )}

        {canApprove && toDecideCount > 0 && (
          <section id="to-decide" className="scroll-mt-24 space-y-4">
            <h2 className="text-lg font-semibold">
              {t("For my decision")} <span className="pill pill-amber ml-1">{toDecideCount}</span>
            </h2>
            {inbox.toDecide.map((g, i) => {
              const c = facts.get(g.caseId);
              const branch = one(c?.bank_branches ?? null);
              const days = daysBetween(g.since, now);
              const approver = g.papers[0]?.assignedApprover;
              return (
                <article key={g.caseId} id={`case-${g.caseId}`} className="glass-card fade-up scroll-mt-24 p-5" style={{ animationDelay: `${i * 40}ms` }}>
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">
                        {g.caseNo} <span className="muted text-base font-normal">· {g.borrower || "—"}</span>
                      </p>
                      <p className="muted text-sm">
                        {[one(branch?.banks ?? null)?.name, branch?.branch_name].filter(Boolean).join(" — ") || "—"}
                        {c?.claim_amount_paise != null && <> · {formatINR(c.claim_amount_paise)}</>}
                        {one(c?.courts ?? null)?.name && <> · {one(c?.courts ?? null)?.name}</>}
                      </p>
                      <p className="muted mt-1 text-sm">
                        {t("Drafter")}: <span className="text-current">{nameOf(c?.assigned_drafter)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className={`pill ${waitTone(days)}`}>
                        ⏳ {t("Waiting")}: {waited(days, t)}
                      </span>
                      <span className={`pill ${g.assignedToMe ? "pill-violet" : "pill-neutral"}`}>
                        {g.assignedToMe ? t("Assigned to you") : `${t("Approver")}: ${nameOf(approver)}`}
                      </span>
                    </div>
                  </header>

                  <ul className="mt-4 divide-y divide-current/10">
                    {g.papers.map((p) => {
                      const url = (p as LoadedPaper).docxPath ? signed.get((p as LoadedPaper).docxPath!) : undefined;
                      const name = paperName(p, t);
                      return (
                        <li key={p.id} className="py-3" data-paper={p.docKind}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium">
                                {name} <span className="muted text-xs">v{p.version}</span>
                              </p>
                              <p className="muted text-xs">
                                {t("Sent on")}: {fmtDate(p.since)}
                                {p.note ? <> · ✎ {p.note}</> : p.version === 1 ? <> · {t("New paper")}</> : <> · {t("New version")}</>}
                              </p>
                              {p.last?.decision === "returned" && (
                                <p className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs">
                                  {t("Sent back earlier")} ({nameOf(p.last.by)}, {fmtDate(p.last.at)}): “{p.last.comments}”
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              {url && <DraftPreview url={url} heading={`${g.caseNo} · ${docLabel(p.docKind)} v${p.version}`} lang={lang} />}
                              {url && (
                                <a className="btn px-3 py-1 text-xs" href={url}>
                                  ⬇ DOCX
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="mt-2">
                            <InboxDecision draftId={p.id} paper={`${g.caseNo} ${name}`} lang={lang} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <Link href={`/dashboard/cases/${g.caseId}`} className="muted mt-2 inline-block text-xs hover:underline">
                    {t("Open the case")} →
                  </Link>
                </article>
              );
            })}
          </section>
        )}

        {inbox.returnedToMe.length > 0 && (
          <section id="returned-to-me" className="glass-card fade-up scroll-mt-24 p-5">
            <h2 className="text-lg font-semibold">
              {t("Sent back to me")} <span className="pill pill-red ml-1">{inbox.returnedToMe.length}</span>
            </h2>
            <p className="muted mt-1 text-sm">{t("Fix what the approver asked for, then send the paper again from the case page.")}</p>
            <ul className="mt-3 divide-y divide-current/10">
              {inbox.returnedToMe.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {p.caseNo} · {paperName(p, t)} <span className="muted text-xs">v{p.version}</span>
                    </p>
                    <p className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-sm">“{p.last?.comments}”</p>
                    <p className="muted mt-1 text-xs">
                      {nameOf(p.last?.by)} · {fmtDate(p.since)}
                    </p>
                  </div>
                  <Link href={`/dashboard/cases/${p.caseId}`} className="btn btn-primary shrink-0 px-3 py-1 text-xs">
                    {t("Fix it")} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {inbox.myWaiting.length > 0 && (
          <section id="my-waiting" className="glass-card fade-up scroll-mt-24 p-5">
            <h2 className="text-lg font-semibold">{t("My papers with the approver")}</h2>
            <ul className="mt-3 divide-y divide-current/10">
              {inbox.myWaiting.map((p) => {
                const days = daysBetween(p.since, now);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <Link href={`/dashboard/cases/${p.caseId}`} className="min-w-0 hover:underline">
                      <span className="font-medium">{p.caseNo}</span> · {paperName(p, t)} <span className="muted text-xs">v{p.version}</span>
                      <span className="muted block text-xs">
                        {t("Approver")}: {nameOf(p.assignedApprover)}
                      </span>
                    </Link>
                    <span className={`pill ${waitTone(days)}`}>
                      ⏳ {t("Waiting")}: {waited(days, t)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {canApprove && inbox.returnedByMe.length > 0 && (
          <section className="glass-card fade-up p-5">
            <h2 className="text-lg font-semibold">{t("Sent back by me, with the drafter")}</h2>
            <ul className="mt-3 divide-y divide-current/10">
              {inbox.returnedByMe.map((p) => (
                <li key={p.id} className="py-2.5">
                  <Link href={`/dashboard/cases/${p.caseId}`} className="hover:underline">
                    <span className="font-medium">{p.caseNo}</span> · {paperName(p, t)} <span className="muted text-xs">v{p.version}</span>
                  </Link>
                  <p className="muted text-xs">
                    {fmtDate(p.since)} · “{p.last?.comments}”
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canApprove && decided.length > 0 && (
          <details className="glass-card fade-up p-5">
            <summary className="cursor-pointer text-lg font-semibold">{t("My recent decisions")}</summary>
            <ul className="mt-3 divide-y divide-current/10">
              {decided.map((a) => {
                const d = one(a.drafts);
                return (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      {d ? (
                        <Link href={`/dashboard/cases/${d.case_id}`} className="hover:underline">
                          <span className="font-medium">{one(d.cases)?.case_no_internal}</span> · {paperName({ docKind: d.doc_kind, language: d.language }, t)}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {a.comments && <p className="muted text-xs">“{a.comments}”</p>}
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="muted text-xs">{fmtDate(a.created_at)}</span>
                      <span className={`pill ${a.decision === "approved" ? "pill-green" : "pill-amber"}`}>{a.decision === "approved" ? t("Approved") : t("Sent back")}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}

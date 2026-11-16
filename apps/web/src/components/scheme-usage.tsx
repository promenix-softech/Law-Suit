import { formatINR, type Meter } from "@civil-suits/domain";
import type { T } from "@/lib/i18n";
import type { MonthUsage, Office } from "@/lib/platform";
import { fmtDate } from "@/lib/ui";

const TONE: Record<Meter["state"], { bar: string; pill: string }> = {
  ok: { bar: "bg-emerald-500", pill: "pill-green" },
  near: { bar: "bg-amber-500", pill: "pill-amber" },
  over: { bar: "bg-red-500", pill: "pill-red" },
};

/** One figure against its allowance: "42 / 150" with a bar, or just the figure when there is no limit. */
function MeterCard({ label, hint, m, t }: { label: string; hint?: string; m: Meter; t: T }) {
  const tone = TONE[m.state];
  return (
    <div className="rounded-2xl border border-current/10 p-4">
      <p className="label">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {m.used.toLocaleString("en-IN")}
        <span className="muted text-base font-normal"> / {m.allowed == null ? t("no limit") : m.allowed.toLocaleString("en-IN")}</span>
      </p>
      {m.allowed != null && (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-current/10" role="img" aria-label={`${m.pct}%`}>
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(m.pct ?? 0, 100)}%` }} />
          </div>
          <p className="mt-1 flex items-center justify-between text-xs">
            <span className="muted">{m.pct}%</span>
            {m.state !== "ok" && <span className={`pill ${tone.pill} px-2 py-0`}>{m.state === "over" ? t("Limit reached") : t("Near the limit")}</span>}
          </p>
        </>
      )}
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

const VALIDITY: Record<Office["status"]["validity"], [string, string]> = {
  none: ["No scheme set", "pill-neutral"],
  not_started: ["Not started yet", "pill-neutral"],
  active: ["Active", "pill-green"],
  ending: ["Ending soon", "pill-amber"],
  expired: ["Expired", "pill-red"],
};

/** The scheme in a line of pills: its name, how it is paid, its state. */
export function SchemePills({ office, t }: { office: Office; t: T }) {
  const [label, tone] = VALIDITY[office.status.validity];
  return (
    <span className="flex flex-wrap items-center gap-2">
      {office.suspendedAt && <span className="pill pill-red">⏸ {t("Paused")}</span>}
      {office.terms ? (
        <>
          <span className="pill pill-violet">{office.terms.schemeName}</span>
          <span className="pill pill-neutral">{office.terms.period === "yearly" ? t("Yearly") : t("Monthly")}</span>
        </>
      ) : null}
      <span className={`pill ${tone}`}>{t(label)}</span>
      {office.status.blocked && <span className="pill pill-red">{t("New cases refused")}</span>}
    </span>
  );
}

/** Usage against the scheme: this month, this scheme year, validity, people, AI readings today. */
export function SchemeMeters({ office, t }: { office: Office; t: T }) {
  const { status, terms, usage } = office;
  const monthName = new Date(`${usage.today}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <MeterCard label={t("New cases this month")} hint={monthName} m={status.month} t={t} />
      <MeterCard label={t("New cases this scheme year")} hint={`${fmtDate(usage.yearStart)} – ${fmtDate(office.yearEnd)}`} m={status.year} t={t} />
      <div className="rounded-2xl border border-current/10 p-4">
        <p className="label">{t("Validity")}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">
          {status.daysLeft == null ? (terms ? t("Open-ended") : "—") : `${status.daysLeft} ${t("days left")}`}
        </p>
        {terms && (
          <p className="muted mt-1 text-xs">
            {fmtDate(terms.validFrom)} – {terms.validUntil ? fmtDate(terms.validUntil) : t("no end date")}
          </p>
        )}
        {terms && (
          <p className="muted mt-1 text-xs">
            {t("At the limit")}: {terms.onLimit === "block" ? t("new cases are refused") : t("only a warning")}
          </p>
        )}
      </div>
      <MeterCard label={t("People")} m={status.seats} t={t} />
      <MeterCard label={t("AI readings in the last 24 hours")} hint={`${t("AI pages this month")}: ${office.aiPagesMonth.toLocaleString("en-IN")}`} m={status.ai} t={t} />
      <div className="rounded-2xl border border-current/10 p-4">
        <p className="label">{t("All cases")}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{office.casesTotal.toLocaleString("en-IN")}</p>
        <p className="muted mt-1 text-xs">
          {t("Last case opened")}: {office.lastCaseAt ? fmtDate(office.lastCaseAt) : "—"}
        </p>
      </div>
    </div>
  );
}

/** Twelve months of usage: bars for new cases, and the figures in a table. */
export function UsageMonths({ months, t }: { months: MonthUsage[]; t: T }) {
  const peak = Math.max(1, ...months.map((m) => m.cases));
  const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  const total = months.reduce(
    (a, m) => ({ cases: a.cases + m.cases, suitPacks: a.suitPacks + m.suitPacks, aiPages: a.aiPages + m.aiPages, aiCostPaise: a.aiCostPaise + m.aiCostPaise }),
    { cases: 0, suitPacks: 0, aiPages: 0, aiCostPaise: 0 },
  );
  return (
    <div>
      <div className="flex h-32 items-end gap-1.5" role="img" aria-label={t("New cases per month")}>
        {months.map((m) => (
          <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-medium">{m.cases || ""}</span>
            <div className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-400" style={{ height: `${Math.max((m.cases / peak) * 100, m.cases ? 4 : 1)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {months.map((m) => (
          <span key={m.month} className="muted min-w-0 flex-1 truncate text-center text-[10px]">
            {label(m.month)}
          </span>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="muted text-left text-xs">
              <th className="py-1.5 font-medium">{t("Month")}</th>
              <th className="py-1.5 text-right font-medium">{t("New cases")}</th>
              <th className="py-1.5 text-right font-medium">{t("Suit packs")}</th>
              <th className="py-1.5 text-right font-medium">{t("AI pages")}</th>
              <th className="py-1.5 text-right font-medium">{t("AI cost")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-current/10">
            {[...months].reverse().map((m) => (
              <tr key={m.month}>
                <td className="py-1.5">{label(m.month)}</td>
                <td className="py-1.5 text-right tabular-nums">{m.cases}</td>
                <td className="py-1.5 text-right tabular-nums">{m.suitPacks}</td>
                <td className="py-1.5 text-right tabular-nums">{m.aiPages}</td>
                <td className="py-1.5 text-right tabular-nums">{formatINR(m.aiCostPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-current/20 font-semibold">
              <td className="py-2">
                {t("Total")} ({months.length} {t("months")})
              </td>
              <td className="py-2 text-right tabular-nums">{total.cases}</td>
              <td className="py-2 text-right tabular-nums">{total.suitPacks}</td>
              <td className="py-2 text-right tabular-nums">{total.aiPages}</td>
              <td className="py-2 text-right tabular-nums">{formatINR(total.aiCostPaise)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

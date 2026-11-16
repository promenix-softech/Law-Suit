import Link from "next/link";
import { formatINR } from "@civil-suits/domain";
import type { Lang } from "@/lib/i18n";
import type { InvoiceRow } from "@/lib/platform-billing";
import { fmtDate } from "@/lib/ui";
import { InvoiceStatusControl } from "./invoice-controls";

const STATUS: Record<InvoiceRow["status"], string> = {
  issued: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-current/10 muted line-through",
};

/** Invoices with their state, a download link and the paid / cancel switches. */
export function InvoiceTable({ rows, showOffice, t, lang }: { rows: InvoiceRow[]; showOffice: boolean; t: (s: string) => string; lang: Lang }) {
  if (!rows.length) return <p className="muted text-sm">{t("No invoices yet.")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <thead>
          <tr className="muted text-left text-xs">
            <th className="px-3 py-2 font-medium">{t("Invoice")}</th>
            {showOffice && <th className="px-3 py-2 font-medium">{t("Office")}</th>}
            <th className="px-3 py-2 font-medium">{t("Period")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("Total")}</th>
            <th className="px-3 py-2 font-medium">{t("Status")}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-current/10">
          {rows.map((r) => (
            <tr key={r.id} data-invoice={r.invoiceNo}>
              <td className="px-3 py-3">
                <a href={`/dashboard/platform/invoices/${r.id}`} className="font-semibold hover:underline">
                  {r.invoiceNo}
                </a>
                <span className="muted block text-xs">{fmtDate(r.issuedAt)}</span>
              </td>
              {showOffice && (
                <td className="px-3 py-3">
                  <Link href={`/dashboard/platform/${r.orgId}`} className="hover:underline">
                    {r.officeName}
                  </Link>
                </td>
              )}
              <td className="px-3 py-3 whitespace-nowrap">
                {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{formatINR(r.totalPaise)}</td>
              <td className="px-3 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[r.status]}`}>{t(r.status === "issued" ? "Unpaid" : r.status === "paid" ? "Paid" : "Cancelled")}</span>
                {r.paymentRef && <span className="muted block text-xs">{r.paymentRef}</span>}
              </td>
              <td className="px-3 py-3">
                <InvoiceStatusControl id={r.id} status={r.status} lang={lang} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

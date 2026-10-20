import "server-only";

export { parseSlabs } from "@civil-suits/domain";

/** Supplier (Promenix) details for invoices; GSTIN is set in the environment once registered. */
export const SUPPLIER = {
  name: process.env.BILLING_SUPPLIER_NAME ?? "Promenix Softech LLP",
  address: process.env.BILLING_SUPPLIER_ADDRESS ?? "Pune, Maharashtra",
  gstin: process.env.BILLING_SUPPLIER_GSTIN ?? null,
  state: "27", // Maharashtra
};

/** First and last day of the IST month containing `now`, as ISO dates. */
export function istMonth(now = new Date()): { start: string; end: string; today: string } {
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${today.slice(0, 7)}-01`, end: `${today.slice(0, 7)}-${String(last).padStart(2, "0")}`, today };
}

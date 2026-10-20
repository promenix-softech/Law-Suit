import { invoiceTotals, rupees } from "@civil-suits/domain";
import { describe, expect, it } from "vitest";
import { toPlainText } from "./model";
import { buildTaxInvoice, type TaxInvoiceInput } from "./taxInvoice";

function input(recipientState: string): TaxInvoiceInput {
  const lines = [
    { description: "Suit packs (1–100)", qty: 40, ratePaise: rupees(1_500) },
    { description: "Monthly minimum top-up", qty: 1, ratePaise: rupees(40_000) },
  ];
  const t = invoiceTotals(lines, "27", recipientState);
  return {
    supplier: { name: "Promenix Softech LLP", address: "Synthetic address, Pune", gstin: null, state: "27" },
    recipient: { name: "Demo Advocates (Synthetic)", address: null, gstin: "27AAPFU0939F1ZV", state: recipientState },
    invoiceNo: "PS/2026-27/0001",
    invoiceDate: "2026-11-01",
    period: { start: "2026-10-01", end: "2026-10-31" },
    sacCode: null,
    lines: lines.map((l) => ({ ...l, amountPaise: l.qty * l.ratePaise })),
    taxablePaise: t.taxablePaise,
    cgstPaise: t.cgst,
    sgstPaise: t.sgst,
    igstPaise: t.igst,
    totalPaise: t.totalPaise,
  };
}

describe("buildTaxInvoice", () => {
  it("shows CGST + SGST for an intra-state supply", () => {
    const t = toPlainText(buildTaxInvoice(input("27")));
    expect(t).toContain("Invoice no.: PS/2026-27/0001");
    expect(t).toContain("Taxable value: ₹1,00,000.00");
    expect(t).toContain("CGST @ 9%: ₹9,000.00");
    expect(t).toContain("SGST @ 9%: ₹9,000.00");
    expect(t).not.toContain("IGST");
    expect(t).toContain("Invoice total: ₹1,18,000.00");
    expect(t).toContain("1 | Suit packs (1–100) | 40 | ₹1,500.00 | ₹60,000.00");
  });

  it("shows IGST for an inter-state supply", () => {
    const t = toPlainText(buildTaxInvoice(input("29")));
    expect(t).toContain("IGST @ 18%: ₹18,000.00");
    expect(t).not.toContain("CGST");
  });
});

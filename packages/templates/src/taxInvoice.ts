import { amountInWordsINR, formatINR, type Paise } from "@civil-suits/domain";
import type { DocModel } from "./model";

export interface TaxInvoiceInput {
  supplier: { name: string; address: string; gstin: string | null; state: string };
  recipient: { name: string; address: string | null; gstin: string | null; state: string };
  invoiceNo: string;
  invoiceDate: string;
  period: { start: string; end: string };
  sacCode: string | null;
  lines: { description: string; qty: number; ratePaise: Paise; amountPaise: Paise }[];
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  totalPaise: Paise;
}

const d = (iso: string) => iso.slice(0, 10).split("-").reverse().join("-");

/**
 * GST tax invoice with the particulars of Rule 46, CGST Rules 2017. All amounts are
 * computed by packages/domain (billing.ts) before they reach the template.
 */
export function buildTaxInvoice(i: TaxInvoiceInput): DocModel {
  const intra = i.igstPaise === 0;
  return {
    templateId: "tax_invoice.en",
    layout: "letter",
    version: 1,
    effectiveFrom: "2026-10-21",
    legalBasis: "CGST Act 2017 s.31; CGST Rules 2017 r.46",
    title: "TAX INVOICE",
    meta: [`Invoice no.: ${i.invoiceNo}`, `Date: ${d(i.invoiceDate)}`],
    to: [],
    blocks: [
      {
        kind: "fields",
        rows: [
          ["Supplier", i.supplier.name],
          ["Address", i.supplier.address],
          ["GSTIN", i.supplier.gstin ?? "________________"],
          ["State code", i.supplier.state],
        ],
      },
      {
        kind: "fields",
        rows: [
          ["Billed to", i.recipient.name],
          ["Address", i.recipient.address ?? "—"],
          ["GSTIN", i.recipient.gstin ?? "Unregistered"],
          ["Place of supply (state code)", i.recipient.state],
          ["Service period", `${d(i.period.start)} to ${d(i.period.end)}`],
          ["SAC", i.sacCode ?? "________"],
        ],
      },
      {
        kind: "table",
        head: ["Sr.", "Description", "Qty", "Rate", "Amount"],
        widths: [8, 44, 10, 18, 20],
        rows: i.lines.map((l, n) => [String(n + 1), l.description, String(l.qty), formatINR(l.ratePaise), formatINR(l.amountPaise)]),
      },
      {
        kind: "fields",
        rows: [
          ["Taxable value", formatINR(i.taxablePaise)],
          ...(intra
            ? ([
                ["CGST @ 9%", formatINR(i.cgstPaise)],
                ["SGST @ 9%", formatINR(i.sgstPaise)],
              ] as [string, string][])
            : ([["IGST @ 18%", formatINR(i.igstPaise)]] as [string, string][])),
          ["Invoice total", formatINR(i.totalPaise)],
          ["In words", amountInWordsINR(i.totalPaise)],
          ["Tax payable on reverse charge", "No"],
        ],
      },
      { kind: "signature", lines: [`For ${i.supplier.name}`, "", "Authorised signatory"] },
    ],
  };
}

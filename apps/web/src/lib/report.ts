/**
 * Status report for a bank: one row per case, built in code from the case records the signed-in
 * person may see (RLS decides that). Amounts are taken from the stored paise; nothing is estimated.
 */

export interface ReportCase {
  caseNo: string;
  borrower: string;
  bank: string;
  branch: string;
  accountLast4: string | null;
  claimPaise: number | null;
  /** English stage label ("Drafting", "Filed", …). */
  stage: string;
  /** ISO dates, or null. */
  openedOn: string;
  noticeSentOn: string | null;
  filedOn: string | null;
  cnr: string | null;
  nextHearingOn: string | null;
  disposal: string | null;
}

export const REPORT_COLUMNS = [
  "Case no.",
  "Borrower",
  "Bank",
  "Branch",
  "Account (last 4)",
  "Claim (Rs.)",
  "Stage",
  "Opened on",
  "Notice sent on",
  "Filed on",
  "CNR",
  "Next hearing",
  "Result",
] as const;

/** Paise as a plain rupee figure with two decimals, by integer arithmetic. */
export function rupees(paise: number | null): string {
  if (paise == null) return "";
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(paise));
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** ISO date as DD-MM-YYYY, the way the office writes dates; other text is left alone. */
export function reportDate(iso: string | null): string {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export function reportRow(c: ReportCase): string[] {
  return [
    c.caseNo,
    c.borrower,
    c.bank,
    c.branch,
    c.accountLast4 ? `XXXX${c.accountLast4}` : "",
    rupees(c.claimPaise),
    c.stage,
    reportDate(c.openedOn),
    reportDate(c.noticeSentOn),
    reportDate(c.filedOn),
    c.cnr ?? "",
    reportDate(c.nextHearingOn),
    c.disposal ?? "",
  ];
}

/**
 * One CSV cell. Every cell is quoted. A cell a spreadsheet would run as a formula (its first character after any
 * leading white space is = + - or @) gets a leading apostrophe, so a borrower name typed as
 * "=HYPERLINK(...)" stays text. A plain negative amount is left as a number.
 */
export function csvCell(value: string): string {
  const risky = /^\s*[=+\-@]/.test(value) && !/^-\d+(\.\d+)?$/.test(value);
  return `"${(risky ? `'${value}` : value).replaceAll('"', '""')}"`;
}

/** CSV with a byte-order mark and CRLF line ends, so Excel opens it with Devanagari intact. */
export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => cells.map(csvCell).join(",");
  return `﻿${[line(header), ...rows.map(line)].join("\r\n")}\r\n`;
}

export interface ReportTotals {
  cases: number;
  claimPaise: number;
  filed: number;
  disposed: number;
}

export function reportTotals(cases: readonly Pick<ReportCase, "claimPaise" | "filedOn" | "disposal">[]): ReportTotals {
  return {
    cases: cases.length,
    claimPaise: cases.reduce((sum, c) => sum + (c.claimPaise ?? 0), 0),
    filed: cases.filter((c) => c.filedOn).length,
    disposed: cases.filter((c) => c.disposal).length,
  };
}

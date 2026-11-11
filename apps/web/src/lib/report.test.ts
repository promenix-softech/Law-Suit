import { describe, expect, it } from "vitest";
import { csvCell, REPORT_COLUMNS, reportDate, reportRow, reportTotals, rupees, toCsv, type ReportCase } from "./report";

const base: ReportCase = {
  caseNo: "DEMO-2026-0001",
  borrower: "Ramesh Demo Patil",
  bank: "Demo Bank",
  branch: "Demo Branch, Pune",
  accountLast4: "4321",
  claimPaise: 149075808,
  stage: "Filed",
  openedOn: "2026-10-20T06:45:34.807531Z",
  noticeSentOn: "2026-10-25",
  filedOn: "2026-11-03",
  cnr: "MHPU010012342026",
  nextHearingOn: "2026-12-01",
  disposal: null,
};

describe("rupees", () => {
  it("writes paise as rupees with two decimals, without rounding", () => {
    expect(rupees(149075808)).toBe("1490758.08");
    expect(rupees(5)).toBe("0.05");
    expect(rupees(100)).toBe("1.00");
    expect(rupees(0)).toBe("0.00");
    expect(rupees(-250)).toBe("-2.50");
    expect(rupees(null)).toBe("");
  });
});

describe("reportDate", () => {
  it("turns ISO dates and timestamps into DD-MM-YYYY", () => {
    expect(reportDate("2026-11-03")).toBe("03-11-2026");
    expect(reportDate("2026-10-20T06:45:34Z")).toBe("20-10-2026");
    expect(reportDate(null)).toBe("");
    expect(reportDate("soon")).toBe("");
  });
});

describe("reportRow", () => {
  it("has one cell per column, with the account masked", () => {
    const row = reportRow(base);
    expect(row).toHaveLength(REPORT_COLUMNS.length);
    expect(row[4]).toBe("XXXX4321");
    expect(row[5]).toBe("1490758.08");
    expect(row[7]).toBe("20-10-2026");
  });

  it("leaves unknown values empty", () => {
    const row = reportRow({ ...base, accountLast4: null, claimPaise: null, cnr: null, nextHearingOn: null, filedOn: null });
    expect([row[4], row[5], row[9], row[10], row[11]]).toEqual(["", "", "", "", ""]);
  });
});

describe("csvCell", () => {
  it("quotes every cell and doubles quotes inside", () => {
    expect(csvCell("Demo Branch, Pune")).toBe('"Demo Branch, Pune"');
    expect(csvCell('M/s "Demo" Traders')).toBe('"M/s ""Demo"" Traders"');
    expect(csvCell("")).toBe('""');
  });

  it("defuses cells a spreadsheet would run as a formula", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(csvCell("+91 98765")).toBe("\"'+91 98765\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
    expect(csvCell("-cmd|' /C calc'!A0")).toBe("\"'-cmd|' /C calc'!A0\"");
    expect(csvCell("\t=1+1")).toBe("\"'\t=1+1\"");
    expect(csvCell(" =1+1")).toBe("\"' =1+1\"");
    expect(csvCell("\n@x")).toBe("\"'\n@x\"");
  });

  it("keeps a plain negative amount as a number", () => {
    expect(csvCell("-2.50")).toBe('"-2.50"');
  });
});

describe("toCsv", () => {
  it("starts with a byte-order mark and ends every line with CRLF", () => {
    const csv = toCsv(["A", "B"], [["1", "x,y"], ["2", "मराठी"]]);
    expect(csv).toBe('﻿"A","B"\r\n"1","x,y"\r\n"2","मराठी"\r\n');
  });
});

describe("reportTotals", () => {
  it("adds claims and counts filed and disposed cases", () => {
    expect(
      reportTotals([base, { ...base, claimPaise: null, filedOn: null }, { ...base, claimPaise: 100, disposal: "Decreed" }]),
    ).toEqual({ cases: 3, claimPaise: 149075908, filed: 2, disposed: 1 });
  });
});

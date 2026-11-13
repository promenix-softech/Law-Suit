// A stand-in for Sarvam Document Intelligence in end-to-end tests (no network, no key, synthetic
// data only). The app reaches it through SARVAM_BASE_URL. It answers an extract job with a
// synthetic loan file: some values sure, one unsure, one that does not validate.
import { createServer } from "node:http";

const PORT = Number(process.env.SARVAM_MOCK_PORT ?? 4010);
const JOB = "e2e-extract-job";
let polls = 0;

const result = {
  borrower_name: "Ramesh Demo Patil",
  borrower_address: "Flat 0, Sample Heights, Demo Road, Pune 411000",
  guarantor_name: "Kiran Test Pawar",
  bank_name: "State Bank of India",
  branch_name: "Demo Branch, Pune",
  ifsc: "SBIN0DEMO01",
  loan_account_number: "DEMO00004002",
  facility_type: "Term Loan",
  sanction_date: "15/06/2023",
  sanction_amount: "Rs. 4,75,000.00",
  interest_rate: "10.50% p.a.",
  npa_date: "31/03/2025",
  outstanding_amount: "Rs. 5,62,310.00",
  outstanding_as_on: "20/10/2026",
  loan_purpose: "ten lakh rupees", // reads fine as text
  tenure_months: "about five years", // does not validate as months
};
const annotations = Object.fromEntries(Object.keys(result).map((k) => [k, { confidence: k === "guarantor_name" ? 0.62 : 0.96, sources: [] }]));

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/doc-ai/v1/job/extract") {
      polls = 0;
      return res.end(JSON.stringify({ job_id: JOB, status: "Running", run_id: "r1" }));
    }
    if (req.url === `/doc-ai/v1/job/${JOB}/status`) {
      polls += 1;
      const done = polls >= 2; // "still reading" once, then done
      return res.end(
        JSON.stringify({
          job_id: JOB,
          status: done ? "completed" : "running",
          pipeline: "extract",
          usage: done ? { pages_total: 3, pages_succeeded: 3 } : {},
          created_at: "2026-11-14T00:00:00Z",
          updated_at: "2026-11-14T00:00:10Z",
        }),
      );
    }
    if (req.url?.startsWith(`/doc-ai/v1/job/${JOB}/results`)) {
      return res.end(JSON.stringify({ job_id: JOB, type: "extract", status: "completed", usage: {}, result, annotations, version: 1 }));
    }
    if (req.url === "/health") return res.end("{}");
    res.statusCode = 404;
    res.end("{}");
  });
}).listen(PORT, "127.0.0.1", () => console.log(`sarvam mock on ${PORT}`));

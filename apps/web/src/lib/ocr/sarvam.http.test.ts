import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confidenceOf, extractionSchema } from "../extract/fields";
import { jobExtraction, jobPages, jobStatus, startDigitise, startExtract } from "./sarvam";

/** A local stand-in for api.sarvam.ai that records what the SDK sends. */
type Seen = { method: string; url: string; headers: IncomingMessage["headers"]; body: string };
const seen: Seen[] = [];
let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      res.setHeader("content-type", "application/json");
      if (req.url === "/doc-ai/v1/job/digitise") return res.end(JSON.stringify({ job_id: "job-123", status: "Accepted", run_id: "r1" }));
      if (req.url === "/doc-ai/v1/job/extract") return res.end(JSON.stringify({ job_id: "job-ex", status: "Running", run_id: "r2" }));
      if (req.url?.startsWith("/doc-ai/v1/job/job-ex/results"))
        return res.end(
          JSON.stringify({
            job_id: "job-ex",
            type: "extract",
            status: "completed",
            usage: {},
            result: { borrower_name: "Vijay Sample Jadhav", sanction_amount: "₹2,60,000.00" },
            annotations: { borrower_name: { confidence: 0.97, sources: [] }, sanction_amount: { confidence: 0.81, sources: [] } },
            version: 1,
          }),
        );
      if (req.url === "/doc-ai/v1/job/job-123/status")
        return res.end(
          JSON.stringify({
            job_id: "job-123",
            status: "completed",
            pipeline: "digitise",
            usage: { pages_total: 2, pages_succeeded: 2 },
            created_at: "2026-10-20T00:00:00Z",
            updated_at: "2026-10-20T00:00:10Z",
          }),
        );
      if (req.url?.startsWith("/doc-ai/v1/job/job-123/results"))
        return res.end(
          JSON.stringify({
            job_id: "job-123",
            type: "digitise",
            status: "completed",
            usage: {},
            documents: [{ file_name: "scan.pdf", pages: [{ page_number: 1, content: "SANCTION LETTER" }, { page_number: 2, content: "Amount ₹2,60,000" }] }],
          }),
        );
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.SARVAM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SARVAM_API_KEY = "test-key";
});

afterAll(() => {
  server.close();
  delete process.env.SARVAM_BASE_URL;
});

describe("Sarvam client wiring (mock server)", () => {
  it("starts a digitise job with the key header, language and the file", async () => {
    const job = await startDigitise(
      { data: new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }), filename: "scan.pdf", contentType: "application/pdf" },
      "en-IN",
    );
    expect(job).toEqual({ jobId: "job-123", status: "running" });
    const req = seen.find((s) => s.url === "/doc-ai/v1/job/digitise")!;
    expect(req.method).toBe("POST");
    expect(req.headers["api-subscription-key"]).toBe("test-key");
    expect(req.headers["content-type"]).toMatch(/multipart\/form-data/);
    expect(req.body).toContain('name="language"');
    expect(req.body).toContain("en-IN");
    expect(req.body).toContain("%PDF-1.4 fake");
  });

  it("reads status and per-page results", async () => {
    expect(await jobStatus("job-123")).toEqual({ status: "completed", pagesTotal: 2, pagesSucceeded: 2 });
    expect(await jobPages("job-123")).toEqual([
      { pageNo: 1, text: "SANCTION LETTER" },
      { pageNo: 2, text: "Amount ₹2,60,000" },
    ]);
    expect(seen.some((s) => s.url === "/doc-ai/v1/job/job-123/results?format=md")).toBe(true);
  });

  it("starts an extract job with the schema and reads result + annotations", async () => {
    const job = await startExtract(
      { data: new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }), filename: "scan.pdf", contentType: "application/pdf" },
      extractionSchema(),
    );
    expect(job).toEqual({ jobId: "job-ex", status: "running" });
    const req = seen.find((s) => s.url === "/doc-ai/v1/job/extract")!;
    expect(req.body).toContain('name="schema"');
    expect(req.body).toContain("sanction_amount");
    expect(req.body).toContain('name="output_format"');

    const out = await jobExtraction("job-ex");
    expect(out.result.borrower_name).toBe("Vijay Sample Jadhav");
    expect(confidenceOf(out.annotations, "sanction_amount")).toBe(0.81);
  });
});

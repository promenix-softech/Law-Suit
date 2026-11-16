import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { openOcrJob, sealOcrJob } from "./seal";

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

const ROW = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("OCR job id seal", () => {
  it("opens what this server sealed for the same row", () => {
    expect(openOcrJob(ROW, sealOcrJob(ROW, "job-abc"))).toBe("job-abc");
  });

  it("does not open a sealed id copied to another row", () => {
    expect(openOcrJob(OTHER, sealOcrJob(ROW, "job-abc"))).toBeNull();
  });

  it("does not open a plain id written through the API, or nothing", () => {
    expect(openOcrJob(ROW, "job-abc")).toBeNull();
    expect(openOcrJob(ROW, "")).toBeNull();
    expect(openOcrJob(ROW, null)).toBeNull();
  });

  it("does not open a tampered value", () => {
    const sealed = sealOcrJob(ROW, "job-abc");
    const flipped = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(openOcrJob(ROW, flipped)).toBeNull();
  });
});

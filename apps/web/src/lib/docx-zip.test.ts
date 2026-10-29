import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { DOCX_LIMITS, inspectDocx } from "./docx-zip";

const sample = () => new Uint8Array(readFileSync(new URL("../../../../docs/samples/suit-set/04-vakalatnama-synthetic.docx", import.meta.url)));

async function zipOf(files: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("inspectDocx", () => {
  it("accepts a generated paper and lists its parts", () => {
    const r = inspectDocx(sample());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entries.some((e) => e.name === "word/document.xml")).toBe(true);
  });

  it("refuses non-ZIP bytes and a ZIP without a document", async () => {
    expect(inspectDocx(new TextEncoder().encode("%PDF-1.7 not a docx at all, padding padding"))).toMatchObject({ ok: false });
    expect(inspectDocx(await zipOf({ "hello.txt": "hi" }))).toMatchObject({ ok: false, error: expect.stringMatching(/not a Word/) });
  });

  it("refuses a zip bomb from the declared sizes, before inflating anything", async () => {
    const bomb = await zipOf({ "word/document.xml": "<w:p>".repeat(1_200_000) }); // ~6 MB unpacked, a few KB packed
    expect(bomb.length).toBeLessThan(100_000);
    expect(inspectDocx(bomb)).toMatchObject({ ok: false, error: expect.stringMatching(/too large/) });
  });

  it("refuses macros and embedded objects", async () => {
    const macro = await zipOf({ "word/document.xml": "<w:document/>", "word/vbaProject.bin": "x" });
    const ole = await zipOf({ "word/document.xml": "<w:document/>", "word/embeddings/oleObject1.bin": "x" });
    expect(inspectDocx(macro)).toMatchObject({ ok: false, error: expect.stringMatching(/macros/) });
    expect(inspectDocx(ole)).toMatchObject({ ok: false, error: expect.stringMatching(/macros/) });
  });

  it("refuses too many parts", async () => {
    const files: Record<string, string> = { "word/document.xml": "<w:document/>" };
    for (let i = 0; i <= DOCX_LIMITS.entries; i++) files[`word/media/x${i}.txt`] = "x";
    expect(inspectDocx(await zipOf(files))).toMatchObject({ ok: false, error: expect.stringMatching(/too many/) });
  });
});

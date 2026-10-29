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

  it("refuses an entry that inflates past the size it declares (lying zip bomb)", async () => {
    const zip = await zipOf({ "word/document.xml": "<w:p>".repeat(1_000_000) }); // 5 MB real
    const bytes = new Uint8Array(zip);
    const view = new DataView(bytes.buffer);
    // Rewrite the declared uncompressed size to 1 KB in both the local header and the central directory.
    for (let i = 0; i < bytes.length - 4; i++) {
      const sig = view.getUint32(i, true);
      if (sig === 0x04034b50) view.setUint32(i + 22, 1024, true);
      if (sig === 0x02014b50) view.setUint32(i + 24, 1024, true);
    }
    expect(inspectDocx(bytes)).toMatchObject({ ok: false, error: expect.stringMatching(/damaged/) });
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

import { describe, expect, it } from "vitest";
import { DOCX_MIME, fileLabel, isCaseUpload, isUploadName, uploadName } from "./upload-name";

const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const NOW = 1_763_000_000_000;

describe("uploadName", () => {
  it("names a file by time, a random id and its type — never by what the person called it", () => {
    expect(uploadName("application/pdf", NOW, ID)).toBe(`${NOW}-${ID}.pdf`);
    expect(uploadName("image/jpeg", NOW, ID)).toBe(`${NOW}-${ID}.jpg`);
    expect(uploadName("image/png", NOW, ID)).toBe(`${NOW}-${ID}.png`);
    expect(uploadName(DOCX_MIME, NOW, ID)).toBe(`${NOW}-${ID}.docx`);
  });

  it("refuses types we do not take", () => {
    expect(uploadName("text/html", NOW, ID)).toBeNull();
    expect(uploadName("", NOW, ID)).toBeNull();
  });

  it("makes a different name each time by default", () => {
    expect(uploadName("application/pdf")).not.toBe(uploadName("application/pdf"));
    expect(isUploadName(uploadName("application/pdf")!, ["pdf"])).toBe(true);
  });
});

describe("isUploadName", () => {
  const ok = `org/case/scans/${NOW}-${ID}.pdf`;

  it("accepts a generated name with an allowed extension", () => {
    expect(isUploadName(ok, ["pdf", "jpg", "png"])).toBe(true);
    expect(isUploadName(`org/case/drafts/corrected-${NOW}-${ID}.docx`, ["docx"])).toBe(false);
    expect(isUploadName(`${NOW}-${ID}.docx`, ["docx"])).toBe(true);
  });

  it("refuses the old style that kept the person's file name, and other extensions", () => {
    expect(isUploadName(`org/case/scans/${NOW}-Patil_loan_file.pdf`, ["pdf"])).toBe(false);
    expect(isUploadName(ok, ["docx"])).toBe(false);
    expect(isUploadName(`org/case/scans/${NOW}-${ID}.pdf.exe`, ["pdf"])).toBe(false);
    expect(isUploadName(`org/case/scans/${NOW}-${ID.toUpperCase()}.pdf`, ["pdf"])).toBe(false);
  });
});

describe("isCaseUpload", () => {
  const name = `${NOW}-${ID}.pdf`;

  it("accepts the case's own folder and a generated name only", () => {
    expect(isCaseUpload(`org/case/scans/${name}`, "org", "case", "scans", ["pdf"])).toBe(true);
  });

  it("refuses extra folders, another case or folder, and a missing part", () => {
    expect(isCaseUpload(`org/case/scans/Patil_1234567890/${name}`, "org", "case", "scans", ["pdf"])).toBe(false);
    expect(isCaseUpload(`org/other/scans/${name}`, "org", "case", "scans", ["pdf"])).toBe(false);
    expect(isCaseUpload(`org/case/mediation/${name}`, "org", "case", "scans", ["pdf"])).toBe(false);
    expect(isCaseUpload(`org/case/${name}`, "org", "case", "scans", ["pdf"])).toBe(false);
    expect(isCaseUpload(`/org/case/scans/${name}`, "org", "case", "scans", ["pdf"])).toBe(false);
  });
});

describe("fileLabel", () => {
  it("shows a new upload by its kind", () => {
    expect(fileLabel(`org/case/scans/${NOW}-${ID}.pdf`)).toBe("PDF");
    expect(fileLabel(`org/case/scans/${NOW}-${ID}.jpg`)).toBe("Photo");
  });

  it("keeps the name of a file stored before the change, without the time prefix", () => {
    expect(fileLabel("org/case/scans/1761000000000-sample_loan_file.pdf")).toBe("sample_loan_file.pdf");
    expect(fileLabel("")).toBe("File");
  });
});

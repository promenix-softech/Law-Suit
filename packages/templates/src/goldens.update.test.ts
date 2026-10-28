import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { maharashtraCourtFee } from "@civil-suits/domain";
import { buildAffidavit } from "./affidavit";
import { toPlainText, type DocModel } from "./model";
import { buildPlaint } from "./plaint";
import { buildAddressMemo, buildBbeCertificate, buildCourtFeeLetter, buildEfilingSheet, buildListOfDocuments, standardDocuments } from "./suitPapers";
import { buildDemandNotice } from "./demandNotice";
import { captionFixture, noticeFixture, officeFixture, plaintFixture } from "./testFixtures";
import { buildVakalatnama } from "./vakalatnama";

/**
 * Rewrites the office-format golden files. Runs only with UPDATE_GOLDEN=1; review the diff
 * line by line before committing — a golden change is a change to legal text.
 */
const write = (name: string, d: DocModel) => writeFileSync(new URL(`./__golden__/${name}`, import.meta.url), toPlainText(d));

it.runIf(process.env.UPDATE_GOLDEN === "1")("writes office-format goldens", () => {
  write("plaint.summary_o37.en.txt", buildPlaint(plaintFixture));
  write("plaint.commercial.en.txt", buildPlaint({ ...plaintFixture, suitType: "commercial", mediation: { reportDate: "2026-10-10", outcome: "non_starter" } }));
  write("vakalatnama.en.txt", buildVakalatnama({ ...captionFixture, office: officeFixture }));
  write("affidavit.en.txt", buildAffidavit(captionFixture));
  write("address_memo.en.txt", buildAddressMemo(captionFixture));
  write("list_of_documents.en.txt", buildListOfDocuments({ ...captionFixture, entries: standardDocuments(plaintFixture) }));
  write("bbe_certificate.en.txt", buildBbeCertificate({ ...plaintFixture, place: "Nashik" }));
  write(
    "court_fee_letter.en.txt",
    buildCourtFeeLetter({
      refNo: "INV/DLA/CF/DEMO01",
      date: "2026-09-10",
      bank: captionFixture.bank,
      borrower: "M/s Demo Agro Traders",
      claimPaise: plaintFixture.claim.totalPaise,
      courtFeePaise: maharashtraCourtFee(plaintFixture.claim.totalPaise),
      courtFeeAct: "Maharashtra Court-fees Act, 1959",
      office: officeFixture,
    }),
  );
  write("efiling_sheet.en.txt", buildEfilingSheet(plaintFixture));
  write("demand_notice.en.txt", buildDemandNotice(noticeFixture));
});

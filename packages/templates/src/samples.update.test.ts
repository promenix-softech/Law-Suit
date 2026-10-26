import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { maharashtraCourtFee } from "@civil-suits/domain";
import { buildAffidavit } from "./affidavit";
import { renderDocx } from "./docx";
import type { DocModel } from "./model";
import { buildDraftDecree, buildPlaint } from "./plaint";
import { buildAddressMemo, buildBbeCertificate, buildCourtFeeLetter, buildEfilingSheet, buildListOfDocuments, standardDocuments } from "./suitPapers";
import { buildDemandNotice } from "./demandNotice";
import { captionFixture, noticeFixture, officeFixture, plaintFixture } from "./testFixtures";
import { buildVakalatnama } from "./vakalatnama";

/** Writes the synthetic office-format suit set to docs/samples/suit-set/. Runs only with UPDATE_SAMPLES=1. */
it.runIf(process.env.UPDATE_SAMPLES === "1")("writes the synthetic suit set as DOCX", async () => {
  const docs: [string, DocModel][] = [
    ["01-plaint-summary-suit", buildPlaint(plaintFixture)],
    ["02-list-of-documents", buildListOfDocuments({ ...captionFixture, entries: standardDocuments(plaintFixture) })],
    ["03-affidavit", buildAffidavit(captionFixture)],
    ["04-vakalatnama", buildVakalatnama({ ...captionFixture, office: officeFixture })],
    ["05-address-memo", buildAddressMemo(captionFixture)],
    ["06-draft-decree", buildDraftDecree(plaintFixture)],
    ["07-bbe-certificate", buildBbeCertificate({ ...plaintFixture, place: "Nashik" })],
    [
      "08-court-fee-letter",
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
    ],
    ["09-efiling-data-sheet", buildEfilingSheet(plaintFixture)],
    ["00-demand-notice", buildDemandNotice(noticeFixture)],
  ];
  for (const [name, d] of docs) {
    writeFileSync(new URL(`../../../docs/samples/suit-set/${name}-synthetic.docx`, import.meta.url), await renderDocx(d));
  }
});

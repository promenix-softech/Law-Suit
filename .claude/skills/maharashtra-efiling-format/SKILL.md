---
name: maharashtra-efiling-format
description: Bombay High Court e-Filing Rules 2022 formatting for Maharashtra district/civil courts — page, margins, fonts, PDF/A, DPI, file names, signatures. Use whenever producing or validating a court document or e-filing bundle.
---
# Maharashtra e-filing format

| Item | Rule |
|---|---|
| Paper | A4 |
| Margins | top 1.5", bottom 1.5", left 1.75", right 1.0" |
| Font | Times New Roman 14 pt, 1.5 line spacing; Marathi in Unicode 14 pt (Noto Serif Devanagari embedded) |
| PDF | Text-searchable; PDF/A preferred (generate PDF/A-2b) |
| Scans | 300 DPI, OCR layer (OCRmyPDF) |
| File name | ≤ 45 characters, ASCII — always via `efilingFileName()` |
| Forbidden | Watermarks, password/encryption |
| Signing | DSC or Aadhaar eSign by the advocate |
| Court fee | Paid online / counter / vendor; transaction ID recorded in `filings.txn_id` |
| Size | 25 MB per document (national manual, 2018) — verify current limit with registry |

Bundle order (as the office files it): [optional system index] → plaint → vakalatnama → list of documents → annexures (bookmarked each) → address memo → affidavit / statement of truth. Draft decree is not in the bundle; the list of documents is mandatory. Every page is stamped "(n)" top right and each annexure's first page "Ann-X" (worker `pageStampProgram`). Worker: `apps/worker/src/bundle.ts` `DRAFT_ORDER`.

The office's own papers (Oct 2026) used margins top/bottom 1.26", left 1.5", right 1.0", Times New Roman 14, 1.5 spacing, a right-aligned page header with the paper's name (AFFIDAVIT, ADDRESS MEMO, DECREE) and a "Page X of Y" footer. Which margins court papers use is an admin-only office setting: "office" (default) or these e-Filing Rules margins. Details: skill `bank-suit-house-style`.

## e-Filing portal data entry ("Public Data Entry")
The clerk types the case into the eCourts e-filing portal; `buildEfilingSheet()` prints every field from the case so nothing is left at a default:
Establishment (court), Case type / Relief sought (Summary Suit, Civil Suit, Commercial Suit), Plaintiff with **Organisation type** (e.g. "Nationalised Banks") and address, main respondent + extra parties with addresses, Cause of action (same text as the plaint), Date of cause of action (DD-MM-YYYY), **Valuation and Amount** (the claim total — the office's own entry once went in as 0.00), Plaint in local language (No), Act "CODE OF CIVIL PROCEDURE" / Section "Order 37" for summary suits, and the Marathi relief "प्रतिवादीकडून रक्कम रु. X/- व्याज व खर्चासह वसूल होऊन मिळावी, ही विनंती." The portal issues an e-filing number (`AMH…`) — record it as `cases.filing_no`.

DRT OA (Phase 4) differs: TNR 13, double spacing, left 5 cm, right 2.5 cm; Parts I–III; 25 MB/doc, 100 MB total.

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

Bundle order: index → plaint → list of documents → annexures (bookmarked each) → vakalatnama → affidavit / statement of truth.

DRT OA (Phase 4) differs: TNR 13, double spacing, left 5 cm, right 2.5 cm; Parts I–III; 25 MB/doc, 100 MB total.

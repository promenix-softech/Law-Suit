# Demo kit — synthetic bank scans + process guide

Everything here is invented: names, addresses, account numbers (`DEMO…`), IFSC (`SBIN0DEMO01`), amounts, dates.
Never upload real client files to the demo site.

| File | What |
|---|---|
| `DEMO-CASE-A-bank-scans.pdf` | Term Loan, Rohit Demo Joshi, guarantor Swati Test Joshi — sanction letter, agreement, guarantee, statement, NPA letter, balance confirmation (6 pages) |
| `DEMO-CASE-B-bank-scans.pdf` | Vehicle Loan, Ganesh Fake Wagh, no guarantor — sanction letter, agreement, hypothecation, statement, NPA letter (5 pages) |
| `manifest.json` | Values the extraction review should show for each file |
| `demo-process-guide-mr.pdf` | Marathi step-by-step guide: flow chart, manual / automatic / AI per step, live screenshots |
| `guide/` | Guide source (HTML + screenshots); `node guide/render.cjs <out.pdf>` |

Both scans are image-only PDFs (300 DPI, slight skew, noise), under Sarvam's 10-page job limit, for the
SBI Demo Branch, Pune that exists in the Nirmal Nyay Associates (Demo) office.

Regenerate the scans: `node scripts/demo-kit-scans.mjs docs/demo-kit` (needs playwright, pdftoppm, ImageMagick).

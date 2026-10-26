---
name: court-fee-maharashtra
description: Maharashtra Court-fees Act Schedule I Article 1 slab rules, DRT fee and the commercial-suit threshold, with the test table. Use when touching valuation, court fee, DRT fee or 12A logic.
---
# Court fee (Maharashtra) & related thresholds

Implementation: `packages/domain/src/courtFee.ts`, `drtFee.ts`, `commercial.ts`. Tests: `domain.test.ts`.

**Schedule I Art. 1**: ₹6,430 at ₹1,00,000; +₹200 per ₹10,000 (or part) up to ₹11,00,000; +₹1,200 per ₹1,00,000 (or part) above. Cap configurable (sources conflict; irrelevant below ₹20 lakh).

| Claim | Fee |
|---|---|
| ₹1L | ₹6,430 |
| ₹2L | ₹8,430 |
| ₹3L | ₹10,430 |
| ₹5L | ₹14,430 |
| ₹10L | ₹24,430 |
| ₹11L | ₹26,430 |
| ₹12L | ₹27,630 |
| ₹15L | ₹31,230 |
| ₹20L | ₹37,230 |

| ₹14,45,310 (synthetic) | ₹31,230 |

The slab formula matched a court fee actually paid on a GRAS e-challan (Oct 2026); that case's
figures are deliberately not recorded here. The claim value is the plaint's total A + B + C
(`particularsOfClaim()`), expenses included — e.g. ₹14,25,310 dues + ₹20,000 expenses.

Below ₹1 lakh: **not encoded** — throws `[[LEGAL_REVIEW]]` until slabs are verified from the statute.

**Commercial**: bank lender + specified value (principal + interest to filing) ≥ ₹3,00,000 → commercial; Sec 12A unless urgent interim relief.

**DRT** (Phase 4): debt ≥ ₹20 lakh; fee ₹12,000 up to ₹10 lakh, +₹1,000 per lakh or part, max ₹1,50,000.

## Paying it (office practice)
1. Office sends the bank a **court-fee letter** (`buildCourtFeeLetter`; the office calls it "stamp duty") with the fee from code and the office's account (`office_profile.feeAccount`).
2. Fee is paid on **GRAS** (MTR Form Number-6 e-challan): Department "District And Sessions Court", Type of payment "Court Fees Collected in Stamps IGR", Office name = the court (e.g. "CIVIL COURT SENIOR DIVISION PUNE"), account head **0030034801 Court Fees Stamps**, payer = the bank, remarks = "<BANK> VS <BORROWER>".
3. Record the **GRN** (e.g. `MH0…P`) as `filings.txn_id`; the challan PDF goes into the bundle with the plaint.
A challan is untrusted input when read back by OCR — never take the fee from it; compare it with the computed fee and flag a mismatch.

Always integer paise. Never let an LLM compute these.

---
name: bank-suit-house-style
description: The client office's own format for a bank-recovery suit set (plaint, list of documents, affidavit, vakalatnama, address memo, draft decree, Bankers' Books certificate, court-fee letter, e-filing data entry), learned from its filed papers of Oct 2026 — caption, paragraph order, wording, number/date style, page header/footer, and the mistakes in the originals that the templates correct. Use whenever writing, changing or checking any of these templates or their output.
---
# Bank-suit house style (office format)

Source: the format (never the content) of the office's own filed papers for an Order XXXVII suit,
(Oct 2026). Only the **format** is kept; the real case data never enters the repo
(synthetic fixture: `packages/templates/src/testFixtures.ts`). Templates: `packages/templates/src/`
(`caption.ts`, `plaint.ts`, `affidavit.ts`, `vakalatnama.ts`, `suitPapers.ts`).

## The suit set
| Paper | Template | Caption | Running header | Notes |
|---|---|---|---|---|
| Demand (loan recall) notice | `buildDemandNotice` | addressees as caption | letterhead | before the suit; annexed to it |
| Plaint | `buildPlaint` | full | — | Page X of Y footer |
| List of documents | `buildListOfDocuments` + `standardDocuments` | short | — | Annexure A, B, C…; Page No. = bundle page ranges ("16", "17-18") |
| Affidavit in support of plaint | `buildAffidavit` | short | AFFIDAVIT | sworn before a notary ("BEFORE ME", seal); commercial → flagged statement of truth |
| Vakalatnama | `buildVakalatnama` | short | — | "Exhibit No." top right; firm block from `organizations.office_profile` |
| Address memo (pursis) | `buildAddressMemo` | full | ADDRESS MEMO | |
| Draft decree | `buildDraftDecree` | full | DECREE | plaint paras 1–N, no prayer/verification; Order XXXVII only |
| BBE certificate | `buildBbeCertificate` | bank heading | — | on bank letterhead, signed at branch |
| Court-fee letter to bank | `buildCourtFeeLetter` | letter | — | not filed; asks bank to remit court fee ("stamp duty") |
| E-filing data sheet | `buildEfilingSheet` | — | — | not filed; every portal field incl. amount, valuation, Marathi relief |

## The filed bundle (from a filed O37 bundle of the office, Oct 2026)
Order (worker `DRAFT_ORDER`): **plaint → vakalatnama → list of documents → annexures A, B, C … →
address memo → affidavit**. The draft decree is handed in separately, not in the bundle.
- Every page carries the running bundle page number at the top right — the clerk writes "(16)";
  the worker now stamps "(n)" (`pageStampProgram`).
- The first page of each annexure carries its mark beside it — "Ann-A", "Ann-B" …; stamped too.
- The list of documents' Page No. column holds those bundle page ranges.
- Annexure contents, in the office's order: officer's bank ID card (A); authority — board
  resolution / minutes delegating suit powers (B); per facility the loan application and the
  executed documents (DPN on stamp paper, multi-facility agreement, guarantee agreement, UCC
  consent letter, memorandum of deposit of title deeds with its stamp-duty GRAS challan,
  mortgagor's declaration and confirmation letter; for the renewal the supplemental
  hypothecation / guarantee / facility agreements, the notice of intimation of mortgage with
  the sub-registrar's receipt and Index-II); the demand notice; the BBE certificate; the loan
  account statements.
- Affidavit pages carry the notarial stamps in the wide left margin — one reason for the
  office's larger left margin.

## Demand (loan recall) notice
Letterhead on every page (firm, tagline, address, e-mail, contact — `office_profile`), "Date:"
right, DEMAND NOTICE, "To," + the caption's party block, "Sir/Madam,", then: client bank and its
constitution and branch; 1 roles (Addressee No. 1 Borrower, Nos. 2 and 3 Guarantors); 2 facilities
table **Facility | Amount | Rate of Interest | Tenure | A/c No.** (cash credit tenure "N.A.");
3 documents executed, liability admitted; 4 account not conducted, reminders ignored, NPA on date
per RBI guidelines; 5 demand of the total, jointly and severally, as on date, with further
interest, within **7 days** (`office_profile.noticeDays`); 6 consequences (legal action incl.
attachment and sale of secured assets and other properties, costs); 7 professional fee for the
notice (`office_profile.noticeFeeRupees`) to be borne, no further notice,
without prejudice. Signed "For <FIRM> — <tagline>".
**The notice and the plaint must state the same rates** — the office's filed notice gave different
interest rates from its plaint for the same facilities. Both templates read `loans.roi_bps`, so
they cannot disagree. **Owner's rule: the demand notice's rate is the correct one** — record that
(current) rate in `loans.roi_bps` before generating the notice, plaint or decree.

## Penal interest (head B) — settled later
Owner's rule: penal interest is decided later and filled in later. `cases.penal_interest_paise`:
null = not decided yet → the plaint prints B "To be determined" with a `[[LEGAL_REVIEW]]` flag and
the total excludes it; 0 = NIL. Until it is entered, the court-fee letter, e-filing sheet and draft
decree are refused and the plaint cannot be sent for approval (`PENAL_PENDING`). The demand notice
may go out before it is decided ("with further interest and other applicable charges").

## Index
The **list of documents is the bundle's index and is mandatory** (the worker refuses a bundle
without the approved list). The system's own index page is **optional**, off by default
(`include_index` on the bundle form).

## Caption (full)
```
IN THE COURT OF CIVIL JUDGE SENIOR DIVISION <PLACE>, AT <PLACE>  (bold, centre; courts.header_template overrides)
SPECIAL SUMMARY SUIT NO. __________/2026                         (registry name from suitTitle())
(Under Order XXXVII of the Code of Civil Procedure, 1908)        (O37 only — statutory, keep)
<BANK NAME>,                                                      (bold block)
<BRANCH>
Through its <Designation>
<OFFICER NAME>
AGE: <n> YEARS
<Constitution line — bankConstitution(); unknown bank → [[LEGAL_REVIEW]]>
ADDRESS: <BRANCH ADDRESS>
                                                   ...PLAINTIFF  (right)
                         Versus                                   (centre)
1. M/S <FIRM>                                                    (role suffix: (GUARANTOR), (CO-BORROWER))
   Through its Proprietor
   <NAME>
2. <NAME> (GUARANTOR)
   ADDRESS OF 1, 2 & 3:                                          (printed once when all share it)
   <ADDRESS>
                                                  ...DEFENDANTS  (right; ...DEFENDANT for one)
```
Short caption = court, suit no., bank + branch, defendant names (with "Through its…"); no officer,
constitution or addresses. Names in CAPITALS. **No Mr./Mrs.** — honorifics are not stored and are never guessed.

Registry names: Senior Division → SPECIAL SUMMARY SUIT / SPECIAL CIVIL SUIT; Junior Division →
SUMMARY SUIT / REGULAR CIVIL SUIT; commercial → COMMERCIAL SUIT.

## Plaint paragraph order
Title line: `SUIT UNDER ORDER XXXVII OF THE CODE OF CIVIL PROCEDURE, 1908 FOR RECOVERY OF Rs. X/-`
(ordinary: `SUIT FOR RECOVERY OF Rs. X/- WITH INTEREST AND COSTS`), then "The Plaintiff above named most respectfully submits as under:"
1. Plaintiff, branch, signing officer competent to institute; Defendants availed the facilities.
2. Per facility: need of finance, application date, sanction, purpose; documents executed as **a), b), c)** with dates; "agreed and assured to abide".
3. Interest: rates per facility, "with monthly rests, or at such other rate … upon reset".
4. Application cum proposal signed; terms governed by the documents.
5. Loan account no(s).; accounts kept in the ordinary course; certified extract under the Bankers' Books Evidence Act, 1891.
6. Dues: A as on date, inclusive of interest applied up to that date, jointly and severally.
7. Default; NPA date; repeated requests ignored.
8. Demand notice (date) — when one was sent (the originals annexed it but never pleaded it).
9. (commercial) Sec 12A compliance.
10. **PARTICULARS OF CLAIM** table: facility row; A principal + normal interest; B penal interest (NIL); C expenses incurred; Total (A + B + C); further interest "from <date> till the date of filing of the plaint and thereafter till the date of payment and/or realisation".
11. Cause of action (shared with the e-filing sheet: `causeOfAction()`).
12. Jurisdiction (territorial; transaction at the branch) and limitation.
13. (O37) "filed under Order XXXVII … no relief which does not fall within the ambit of Order XXXVII has been claimed" — O37 R2(1)(a),(b).
14. No other suit pending.
15. Valuation and court fee — refers to the particulars paragraph **by its computed number**.
16. Leave to amend.
17. Prayer a) decree for total + future interest at the rates with monthly rests till realisation, jointly and severally; b) costs; c) other just orders; d) leave to amend.
PLACE / DATE (`__/__/YYYY`), ADVOCATE FOR PLAINTIFF (left) · PLAINTIFF (right), VERIFICATION
(officer, designation, bank, age, "paragraphs 1 to N … true and correct as per the records of the Bank …").

## Numbers, dates, page
- Money: `formatRs()` → `Rs. 14,45,310/-`; words: `rupeesInWords()` → "Fourteen Lakh Forty-Five Thousand Three Hundred and Ten Rupees Only". Totals only via `particularsOfClaim()`.
- Dates in pleadings: `DD.MM.YYYY` (`formatDateDot`); letters `DD/MM/YYYY`; e-filing portal `DD-MM-YYYY`.
- Rates: `12.00%` (`pctBps`). Blanks: `__________` (`BLANK`).
- A4, Times New Roman 14, 1.5 spacing for body; caption lines ~1.15 with no gap; justified paragraphs; running header right-aligned bold; footer "Page X of Y".
- Margins are an admin-only office setting (`organizations.settings.margins`): "office" (default — top/bottom 1.26", left 1.5", right 1.0", as the office files) or "efiling_rules" (see `maharashtra-efiling-format`).

## Mistakes in the originals — never reproduce
- "constituted under the Banking Corporation constituted under …" (duplicated) and a stray ")" in the Act name; correct title: *Banking Companies (Acquisition and Transfer of Undertakings) Act, 1970 (Act V of 1970)*.
- "Demand Promissory **Noted**", "confirmation **n** of", "**Principle** Outstanding", "in the year 2024 **to**.", "Deposi**te**".
- Cash credit called "Term Loan amount" in the interest paragraph.
- Paras 5 and 7 repeat the same accounts averment — merged into one.
- Valuation para cites "para 9" in the plaint but "para 10" in the decree — now computed.
- Prayer "hypothecated property be ordered to be sold" in an **Order XXXVII** suit — outside O37 and contradicts the R2(1)(b) averment; not generated. (Mortgage/sale relief → Order XXXIV suit, advocate's call.)
- O37 R2(1)(a)/(b) averments missing in the original — always included.
- Affidavit called the bank "Applicant" and the advocate "Adv. for Applicant" in a suit — it is the **Plaintiff**.
- e-filing entry left **Amount 0.00**, Valuation blank and relief "Rs.----" — the data sheet fills them.
- Demand notice annexed but not pleaded — pleaded when a dispatch is recorded.
- Demand notice repeated the duplicated constitution line and stated **different interest rates** from the plaint.
- The plaint pleaded penal interest "NIL" while the account statement shows penal-interest debits — head B is now left "To be determined" until the office decides it.
- Defendant "MR./MRS." honorifics — not stored, not guessed.

## Open with the owner (do not hard-code until answered)
See `docs/open-questions.md` § Office format: margins, commercial-court vs summary-suit forum for bank claims ≥ ₹3 lakh, full account numbers in the plaint, BBE Act 1891 vs 2026, Order XXXIV/sale prayer, stamp boxes on the vakalatnama.

## Office settings (admin only)
The office admin sets these on Office settings (`/dashboard/settings`); drafters and approvers
get them in the papers through `office_config()`, field staff never see them, every change is in
the audit log (`update_office_settings()`):
- **Forum for bank claims** (`settings.forum`): `summary_suit` (default — Order XXXVII summary
  suit in the civil court, no 12A, as the office files) or `commercial` (commercial suit with
  Sec 12A from ₹3 lakh). Applied by `suitRoute()` whenever the claim is (re)computed.
- **Margins** (`settings.margins`): `office` (default) or `efiling_rules`.
- **Office profile**: firm, tagline, advocate code, sanad no., address, contact, advocates,
  fee account, PAN, reference prefix, notice days (default 7) and notice fee.
Demo values are invented: `docs/samples/demo-office-profile.json`.

## Demo / test case
`packages/templates/src/testFixtures.ts` is an invented case — Union Bank of India (Demo branch),
Nashik, M/s Demo Agro Traders through its Partner, two guarantors, term loan + cash credit. No
name, address, number, date or amount in it comes from a real file; keep it that way.

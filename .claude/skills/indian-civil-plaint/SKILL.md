---
name: indian-civil-plaint
description: Required contents of a bank money-recovery plaint in Maharashtra civil/commercial courts — CPC Order VII Rule 1 particulars, Order XXXVII summary-suit inscription, commercial-suit Sec 12A and statement of truth, prayer, verification. Use when building or checking plaint, affidavit, vakalatnama, 12A or demand-notice templates.
---
# Indian civil plaint (bank recovery)

Never invent statutory wording. Where exact text is unknown, insert `[[LEGAL_REVIEW]]`.

## Order VII Rule 1 CPC — plaint must contain
1. Name of the court.
2. Plaintiff: name, description, place of residence/registered office (bank + branch through its authorised officer).
3. Defendants: borrower, co-borrowers, guarantors — name, description, residence (so far as ascertainable).
4. Disability statement (minor / unsound mind) if any.
5. Facts constituting the cause of action and **when it arose** (sanction, disbursement, default, NPA date, demand notice, its service).
6. Facts showing the court has **jurisdiction** (territorial + pecuniary).
7. **Relief** claimed.
8. Set-off / relinquishment, if any.
9. **Valuation** for jurisdiction and court fee (computed by `maharashtraCourtFee`, never by hand/LLM).
10. Interest claimed: rate, period, pendente lite and future interest.

Office format (caption, paragraph order, wording, mistakes to avoid): skill `bank-suit-house-style`.

## Suit types
- **Ordinary suit**: CPC verification at the end. Registry name: Special Civil Suit (Senior Division) / Regular Civil Suit (Junior Division).
- **Summary suit (Order XXXVII)**: "(Under Order XXXVII of the Code of Civil Procedure, 1908)" immediately below the suit number (R2(1)(c)); the plaint avers (a) the suit is filed under Order XXXVII and (b) no relief outside its ambit is claimed (R2(1)(a),(b)) — so **no prayer for sale of mortgaged/hypothecated property** in an O37 plaint. Registry name: Special Summary Suit (Senior Division) / Summary Suit (Junior Division). The office files a **draft decree** (plaint paragraphs under a "DECREE" header) with it. Order XIII-A summary judgment does not apply.
- **Commercial suit** (`commercialCheck().isCommercial` — bank lender and specified value ≥ ₹3 lakh incl. interest to filing):
  - Sec 12A pre-institution mediation is mandatory unless urgent interim relief is sought (Patil Automation v. Rakheja Engineers, (2022) 10 SCC 1 — plaint rejected under O.VII R.11 otherwise). Plead compliance and annex the failure/non-starter report.
  - **Statement of truth** in Commercial Courts format replaces ordinary verification.

## Particulars of claim and prayer
Claim = A principal + normal interest (sum of `loans.outstanding_paise`) + B penal interest (`cases.penal_interest_paise`, NIL when 0) + C expenses (`cases.expenses_paise`) — always via `particularsOfClaim()`; that total drives valuation, court fee, forum and the commercial check.
Prayer: (a) decree for the total with further interest at the contract rate(s) with monthly rests from the claim date till realisation, jointly and severally; (b) costs; (c) other just orders; (d) leave to amend.

## Annexures / list of documents (office order, `standardDocuments()`)
Officer's ID proof; authority letter / POA of the officer; per facility the loan application and every executed document (DPN, agreements, guarantee, consent letter, mortgage/hypothecation papers — `loans.executed_docs`); demand notice + proof of dispatch; 12A report (commercial); Bankers' Books certificate; account statement. Marks A, B, C …; page numbers filled after pagination.
The office still certifies print-outs under **s.2A of the Bankers' Books Evidence Act, 1891** (Oct 2026 filings). The repo's earlier note of a "BBE Act 2026" is unconfirmed — `[[LEGAL_REVIEW]]` until the owner confirms which Act applies to filings from now on.

## Vakalatnama (Maharashtra)
Office format: "Exhibit No." top right, short caption, "I / We, the undersigned <bank>, <branch>, through its authorised officer … appoint and authorise <FIRM>, <ADV. …> to act, appear and plead", firm block (name, tagline, advocate code, sanad no., office address, contact, e-mail from `organizations.office_profile`), witness, "Accepted and filed on". Advocates' Welfare Fund stamp (statute: ₹20 — confirm with Bar Council) + court-fee stamp (₹10 subordinate courts) are affixed by hand.

## Affidavit in support of plaint (non-commercial)
CPC O.VI R.15(4). Officer swears he knows the facts by virtue of his post, signed the plaint for the bank, contents and prayers true per knowledge and bank records, nothing suppressed. Party is the **Plaintiff** (never "Applicant"). "I know the Affiant / Adv. for Plaintiff" left, "Affiant" right.

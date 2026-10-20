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

## Suit types
- **Ordinary suit**: CPC verification at the end.
- **Summary suit (Order XXXVII)**: title must carry "(Under Order XXXVII of the Code of Civil Procedure, 1908)" and the plaint must aver that no relief outside the scope of Order XXXVII is claimed `[[LEGAL_REVIEW]]` for exact averment. Order XIII-A summary judgment does not apply.
- **Commercial suit** (`commercialCheck().isCommercial` — bank lender and specified value ≥ ₹3 lakh incl. interest to filing):
  - Sec 12A pre-institution mediation is mandatory unless urgent interim relief is sought (Patil Automation v. Rakheja Engineers, (2022) 10 SCC 1 — plaint rejected under O.VII R.11 otherwise). Plead compliance and annex the failure/non-starter report.
  - **Statement of truth** in Commercial Courts format replaces ordinary verification.

## Prayer clause (structure)
(a) decree for ₹[amount] with interest @ [rate]% p.a. from [date] till filing; (b) pendente lite and future interest; (c) costs; (d) such other relief.

## Annexures / list of documents
Sanction letter, loan agreement, statement of account with Bankers' Books certificate (BBE Act 2026, Second Schedule for electronic records — `[[LEGAL_REVIEW]]` until gazette text verified), demand notice + postal proof, 12A report (commercial), board resolution/POA of signing officer.

## Vakalatnama (Maharashtra)
Advocates' Welfare Fund stamp (statute: ₹20 — confirm with Bar Council) + court-fee stamp (₹10 subordinate courts). Leave boxes for both.

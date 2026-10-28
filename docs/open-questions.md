# Open questions for the client

| # | Question | Why it matters | Status |
|---|---|---|---|
| 1 | Which courts (city civil / district / commercial) and districts do you file in? | Templates, court headers, jurisdiction clauses | Open |
| 2 | What share of suits are ₹3 lakh or more, and do you already do 12A mediation? | Workflow stage and template | Open |
| 3 | Do you file as ordinary suits or Order XXXVII summary suits? | Title, averments, prayer | Open |
| 4 | Has each bank issued a new-format BBE Act 2026 certificate yet? | Certificate template | Open |
| 5 | Do bank empanelment letters restrict cloud storage or AI processing of bank data? | Vendor / data-location design | Open |
| 6 | Who holds the DSC and who files on eCourts (Field or Admin)? | Role permissions | Open |
| 7 | Marathi drafts: which courts accept or require them? | Language defaults | Open |
| 8 | What is the current time per suit, per stage? | ROI presentation | Open |
| 9 | ICICI empanelment timeline? | Bank template order | Open |
| 10 | DRT: which bench for which district (current notification), and the OA form you use (parts, verification)? | DRT Original Application template, bench selection | Open |
| 11 | DRT: e-DRT filing format and who files there? | DRT bundle / e-filing | Open |

## Office format (from the office's filed set, 26 Oct 2026)
Defaults in code are shown; nothing below is hard-coded beyond the default until answered.

| # | Question | Default now | Status |
|---|---|---|---|
| 14 | Plaint shows full loan account numbers; the system keeps them encrypted and prints XXXXXX+last 4. Fill the full number only in the final (approved) PDF on the worker? | Masked in drafts | Open |
| 15 | Bankers' Books certificate: the office certifies under s.2A of the 1891 Act. Is that still right for new filings (repo had a note about a "BBE Act 2026")? Does the bank add the s.2A(b)/(c) computer-system particulars? | 1891 Act, s.2A(b)/(c) flagged | Open |
| 16 | The original O37 plaint prayed for sale of the hypothecated/mortgaged property — outside Order XXXVII. Drop it (default), or file such cases as ordinary/Order XXXIV suits? | Not generated | Open |
| 17 | The original O37 plaint lacked the O37 R2(1)(a),(b) averments. OK to always include them? | Included | Open |
| 18 | Vakalatnama: stamps affixed by hand in the margin (no boxes printed) — correct? Welfare stamp amount? | No boxes; note printed | Open |
| 19 | Expenses (head C): fixed office amount or per case? | Per case, entered by the drafter | Open |
| 24 | The office's own PAN and fee account number sit in `office_profile` as plain text (admins see them on Office settings; drafters/approvers get them in the fee letter; field staff never). They are the firm's business details, not borrower PII. OK, or encrypt them like `*_enc`? | Plain text, admin-managed | Open |

## Resolved
| # | Question | Owner's answer (26 Oct 2026) | Done in |
|---|---|---|---|
| 21 | Notice and plaint gave different interest rates | The demand notice's rate is the correct one. Plaint, notice and decree all print the one rate recorded per facility (`loans.roi_bps`); record the notice's (current) rate there | Skill `bank-suit-house-style` |
| 22 | Penal interest "NIL" vs statement | Penal interest is settled later and must be fillable later: blank = not decided (draft says "To be determined" + flag), 0 = NIL. Court-fee letter, e-filing sheet, draft decree and submitting the plaint wait until it is entered | `particularsOfClaim().penalPending`, `cases.penal_interest_paise` nullable |
| 12 | Forum for bank claims ≥ ₹3 lakh | Admin-only office setting. Default chosen: Order XXXVII summary suit in the civil court (the office's practice); admin can switch to commercial suit + 12A | `organizations.settings.forum`, `suitRoute()`, Office settings page |
| 13 | Margins | Admin-only office setting. Default chosen: the office's own filed margins (left 1.5", top/bottom 1.26"); admin can switch to the e-Filing Rules profile | `settings.margins`, `renderDocx({ courtMargins })` |
| 20 | Office details | Demo office details chosen by Promenix (invented: `docs/samples/demo-office-profile.json`); the real office enters its own on the admin-only Office settings page | `update_office_settings()` |
| 23 | List of documents vs system index | List of documents is mandatory in the bundle; the system's index page is optional (off by default) | Worker `include_index`, bundle form checkbox |

# Client demo script — Civil Suits (29 Oct 2026)

Live at **https://civilsuits.promenix.in**. Every name, bank branch, amount and date on the
demo database is invented. Passwords are in the owner's PDF (not in the repo).

Office for the demo: **Nirmal Nyay Associates (Demo)** (Maharashtra, Special Summary Suit format).

| Who | Login | Use for |
|---|---|---|
| Admin | `admin@demo.civilsuits.test` | Dashboard, office settings, audit, billing |
| Drafter | `drafter2@demo.civilsuits.test` | Hero case DEMO-2026-0002 |
| Approver | `approver@demo.civilsuits.test` | Approvals |
| Field | `field@demo.civilsuits.test` | Phone task list (optional) |

Use two browsers (or one normal + one private window): drafter on the left, approver on the right.

## Flow (about 20 minutes)

1. **Admin dashboard** (2 min): cases by stage, deadlines, approver queue. Switch **English ⇄ मराठी**
   (top bar) and back. `Ctrl+K` opens the command palette.
2. **Office settings** (admin, 2 min): firm details printed on the vakalatnama and the fee letter,
   forum for bank claims (*Special Summary Suit*), margins (*office format*). Only the admin sees this page;
   every change goes to the audit log.
3. **Hero case DEMO-2026-0002** (drafter, 8 min) — borrower *Sunita Test Kulkarni*, Term Loan,
   SBI Demo Branch, Pune:
   - Claim card: amount and court fee are computed in code, never by AI.
   - **Suit particulars**: penal interest (B) is still blank = *to be determined*. Click
     **Generate plaint** — it prints "To be determined" in the claim table; **Generate draft decree**
     is refused until B is entered. Submitting the plaint for approval is refused too.
   - Enter penal interest (e.g. `2961`), **Save particulars**. Amount and court fee update.
   - Generate the set: plaint, list of documents, vakalatnama, affidavit, address memo,
     draft decree, Bankers' Books certificate, court-fee letter, e-filing data sheet, demand notice.
     Open **Preview** on the plaint: office caption, *SPECIAL SUMMARY SUIT*, Order XXXVII,
     particulars of claim A + B + C, Rs. x/- and amounts in words.
   - **Submit for approval** on the plaint and the other papers.
4. **Approver** (3 min): same case → **Approve** (or *Return to drafter* with a comment).
   The approver can never approve their own draft — the database refuses it, not just the screen.
5. **Audit log** (admin, 1 min): every generate / submit / approve is in the hash-chained log.
6. **Commercial-suit example** DEMO-2026-0007 (optional, 2 min): Sec 12A mediation stage and
   the statement of truth. Do not press *Save particulars* here: with the office forum set to
   *Special Summary Suit* the case would be re-routed to a summary suit.
7. Close with the demo film (`docs/marketing/demo-video`) for the parts not live yet.

## Not live tomorrow — say so
- **E-filing PDF/A bundle and bulk upload** need the document worker (VPS not set up yet).
  The button queues the job; it is not built until the worker runs. Show it in the film.
- **`[[LEGAL_REVIEW]]` markers**: BBE Act 2026 certificate wording, court-fee slabs below ₹1 lakh,
  welfare stamp — filled in once the gazette text / advocate confirms. This is deliberate: the system
  never invents statutory text.
- **Marathi demand notice** — after the Marathi legal terms are confirmed. The screens are already bilingual.
- **OTP login (MFA)** for admin and approver — on hold at the owner's request.

## Upload demo (new case from scans)
Files and a step-by-step Marathi guide with screenshots: `docs/demo-kit/` (`demo-process-guide-mr.pdf`).
Case A is open as DEMO-2026-0011 (drafter1) with its scan uploaded — continue from **Run OCR**.
Case B (`DEMO-CASE-B-bank-scans.pdf`) is for opening a case live from step one.
Run OCR / Extract fields need a valid `SARVAM_API_KEY` in Vercel — on 29 Oct the live site got 401/403.

## Before the demo
- Owner: Supabase → Authentication → sign-ups off; demo passwords at hand.
- Log in once with each account the morning of the demo (sessions stay warm).
- Do not upload real files on the demo site.

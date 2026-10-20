# "Civil Suits" Project Planning Report: Bank-Recovery Plaint Automation SaaS for a Maharashtra Panel-Advocate Office (Promenix Softech LLP, October 2026)

**Bottom line: the product is technically cheap to run, at roughly ₹35 of AI cost per 15-page case. The client is willing to pay ₹2,000–3,000 per suit and earns about ₹15,000 net per suit. Promenix's working figures (₹60k own cost, ₹80–90k initial price, ₹1–1.5 lakh total) are therefore far too low to be the whole price, and should be used only as a pilot/onboarding fee alongside a per-suit usage charge.** Two legal changes since the meeting also affect the build directly. First, the Bankers' Books Evidence Act, 1891 (and its Section 2A certificate) was replaced on 1 October 2026 by the Bankers' Books Evidence Act, 2026, which uses new Schedule-based certificates. [a2ztaxcorp](https://a2ztaxcorp.net/bankers-books-evidence-act-2026-to-come-into-force-from-1-october-modernising-and-simplifying-the-use-of-banking-records-as-evidence-in-legal-proceedings/) [elplaw](https://elplaw.in/wp-content/uploads/2026/08/New-Bankers-Books-Evidence-Act.pdf) Second, most bank recovery suits of ₹3 lakh or more are "commercial disputes", so the software must handle Section 12A pre-institution mediation and a statement of truth. [raizadaassociates](https://www.raizadaassociates.com/blog/section-12a-pre-institution-mediation-commercial-suit) [indiankanoon](https://indiankanoon.org/doc/120672206/)

## TL;DR
- **Build it, but price it on usage, not as a lifetime licence.** At this client's volume (150–500 suits/month), the full monthly cost of infra, AI and operations comes to about ₹17,000–34,000. A 90% gross margin therefore needs only about ₹115–₹680 per suit. The recommended offer: ₹90,000 + GST pilot/onboarding fee, then ₹1,500 per suit pack (slabs down to ₹600) with a ₹1 lakh/month minimum. A 6% revenue-share option is offered as an alternative.
- **The legal templates must follow 2026 law.** Bank-statement certificates move from BBE Act 1891 Sec 2A to the Bankers' Books Evidence Act, 2026 (in force 1 October 2026), which uses separate certificates for physical and electronic records. Suits of ₹3 lakh or more on bank loans are commercial disputes, needing Section 12A mediation (unless urgent relief is sought) and a statement of truth. Court fee follows the Maharashtra Court-fees Act slab (e.g. ₹24,430 on ₹10 lakh). E-filing must follow the Bombay HC e-Filing Rules 2022 (A4, Times New Roman 14, OCR-searchable PDF/A preferred, 300 DPI, file names of 45 characters or fewer, DSC/Aadhaar eSign).
- **Stack:** Next.js (Vercel Pro for anything commercial, because Hobby is non-commercial only) + Supabase (Postgres/RLS/Auth/Storage; Free for the demo, Pro at $25/month for the pilot) + a document-worker VPS (LibreOffice/OCRmyPDF) + Sarvam Vision (₹0.50/page) for Indic OCR + Claude Sonnet 5.5 ($2/$10 per million tokens) for extraction and drafting, with Haiku 5.5 for page classification. Build it with Claude Code using project skills, 7 subagents, safety hooks, and the Supabase, Vercel, GitHub and Playwright MCPs.

---

## A. Claude Code Platform Setup (do this first)

Claude Code in 2026 has six building blocks: CLAUDE.md (always-on rules), Skills (`.claude/skills/<name>/SKILL.md`, loaded on demand), Subagents (`.claude/agents/*.md`, each with its own context and tool limits), Hooks (deterministic scripts on lifecycle events such as PreToolUse, PostToolUse, SessionStart, Stop, SessionEnd), MCP servers (`.mcp.json` or `claude mcp add`), and Plugins (versioned bundles of all of these). [marktechpost](https://www.marktechpost.com/2026/06/14/claude-code-guide-2026-25-features-with-examples-demo/) Subagents can run with worktree isolation. [hidekazu-konishi](https://hidekazu-konishi.com/entry/claude_code_features_settings_reference_2026.html) Plugin-shipped subagents cannot use the hooks, mcpServers or permissionMode fields, so define security-critical agents at project level rather than through plugins. [claude](https://code.claude.com/docs/en/sub-agents)

### A1. Skills

| Priority | Skill (project-level, write these) | What it teaches Claude |
|---|---|---|
| **REQUIRED** | `indian-civil-plaint` | CPC Order VII Rule 1 particulars, Order XXXVII summary-suit title inscription and averment, commercial-suit requirements (Sec 12A mediation report, statement of truth), prayer clauses, interest and cause-of-action paragraphs, verification |
| **REQUIRED** | `maharashtra-efiling-format` | Bombay HC e-Filing Rules 2022: A4; margins top/bottom 1.5", left 1.75", right 1.0"; Times New Roman 14 at 1.5 spacing; Unicode 14 for Marathi; OCR-searchable PDF/A; 300 DPI; file names of 45 characters or fewer; no watermark or encryption; DSC/eSign; court-fee transaction ID [s3waas](https://cdnbbsr.s3waas.gov.in/s3ec0231c0c178a9fc26ffecffd8670e6d/uploads/2023/04/2023040383.pdf) |
| **REQUIRED** | `docgen-pdfa-pipeline` | DOCX templating → LibreOffice headless → PDF/A-2b with embedded Devanagari fonts, bookmarks, pagination, merging annexures, OCRmyPDF for scans |
| **REQUIRED** | `supabase-rls-security` | Multi-tenant RLS patterns, maker-checker constraints, append-only audit triggers, storage policies, field encryption |
| **REQUIRED** | `ocr-extraction-pipeline` | Page classification and splitting, Sarvam/Google OCR calls, JSON extraction schema, confidence scoring, human verification UI rules |
| **REQUIRED** | `dpdp-pii-handling` | PII inventory, Aadhaar masking, pseudonymisation before LLM calls, retention and erasure, breach runbook |
| SUGGESTED | `court-fee-maharashtra` | The Schedule I Article 1 slab calculator, with test table |
| SUGGESTED | `marathi-legal-glossary` | Fixed English↔Marathi legal term pairs (वादी/प्रतिवादी, दावा, etc.) and transliteration rules for names |
| SUGGESTED | `synthetic-case-fixtures` | Generates fake borrowers, loans and scans; forbids real data in the repo |
| SUGGESTED | Bundled skills: `/code-review`, `/verify`, `/simplify`, `/claude-api`; plus `/security-review` | Built-in review, verification and API-reference helpers | [totalum](https://www.totalum.app/blog/claude-code-skills-totalum) [ofox](https://ofox.ai/blog/claude-code-hooks-subagents-skills-complete-guide-2026/)

### A2. Subagents (agent team)

| Priority | Agent | Tools | Responsibility |
|---|---|---|---|
| **REQUIRED** | `requirements-analyst` | Read, Write (docs only) | Turns meeting notes into user stories and acceptance criteria; keeps `docs/requirements.md` current |
| **REQUIRED** | `architect` | Read, Write (docs/ADR) | Schema, module boundaries, ADRs, cost guardrails |
| **REQUIRED** | `backend-engineer` | Full (dev DB only) | Supabase migrations, RLS, edge functions, worker queue, AI calls |
| **REQUIRED** | `frontend-engineer` | Full | Next.js App Router UI, role dashboards, PWA view for Field |
| **REQUIRED** | `docgen-specialist` | Full | Templates, DOCX→PDF/A, Devanagari, bookmarks, e-filing bundle |
| **REQUIRED** | `security-reviewer` | Read-only + Bash (scanners) | RLS tests, secrets scan, OWASP review, DPDP checklist; must approve each PR |
| **REQUIRED** | `qa-verifier` | Read, Bash, Playwright MCP | Unit, integration and e2e tests; golden-file comparisons of generated documents |
| SUGGESTED | `legal-format-checker` | Read-only | Checks every generated draft against the plaint, vakalatnama, affidavit and BBE certificate checklists |
| SUGGESTED | `ai-cost-auditor` | Read-only | Tracks tokens and pages per case; flags any case above ₹50 of AI cost |

### A3. MCP servers

| Priority | MCP | Rule |
|---|---|---|
| **REQUIRED** | Supabase MCP | Connect **only to the dev/demo project**, read-only where possible; never to production |
| **REQUIRED** | GitHub MCP | Issues, PRs, branch protection |
| **REQUIRED** | Playwright MCP | E2E tests of the role flows and uploads |
| **REQUIRED** | Vercel MCP | Preview deployments and logs |
| SUGGESTED | Google Drive (existing connector) | **Fake/demo data only**; never NDA-covered client files |
| SUGGESTED | Error monitoring (e.g. Sentry) | Production error triage |

### A4. Hooks (`.claude/settings.json`)

| Event | Hook | Purpose |
|---|---|---|
| PreToolUse (Bash) | Block `rm -rf`, `supabase db reset --linked`, `psql` to prod hosts, `git push --force` | Prevent destructive operations (exit code 2 blocks) | [claude](https://code.claude.com/docs/en/sub-agents)
| PreToolUse (Edit/Write) | Block edits to `.env*`, `supabase/migrations/*` already applied, `/secrets` | Protect secrets and applied migrations |
| PreToolUse (Write) | Regex-scan for 12-digit Aadhaar, PAN `[A-Z]{5}[0-9]{4}[A-Z]`, and account-number patterns in fixtures/tests | Stop real PII entering the repo |
| PostToolUse (Edit/Write) | `prettier`, `eslint --fix`, `tsc --noEmit` on changed files | Code quality |
| Stop | Run `pnpm test:unit` and the RLS test suite | Don't end a task while tests are red |
| SessionStart | Print `docs/STATUS.md` (current phase, open tasks) | Keeps context across sessions |
| SessionEnd | Append a session summary to `docs/sessions/` | Audit trail of AI-assisted development | [hidekazu-konishi](https://hidekazu-konishi.com/entry/claude_code_features_settings_reference_2026.html)

### A5. CLAUDE.md outline

1. **Project:** Civil Suits, a bank-recovery suit automation tool for one Maharashtra advocate office (multi-tenant ready).
2. **Non-negotiables:** no real client data in the repo or prompts; RLS on every table; Approver ≠ Drafter; append-only audit log; all money in paise (integers); all dates in IST, stored UTC.
3. **Stack and versions:** Next.js (App Router, TypeScript strict), Supabase (Mumbai region), worker (Node/Python on VPS), pgmq queue.
4. **Commands:** dev, test, e2e, lint, migration, seed-fake-data.
5. **Folder map:** `apps/web`, `apps/worker`, `packages/templates`, `supabase/`, `docs/`.
6. **Coding conventions:** zod validation on every boundary; server actions only for mutations; no client-side secrets.
7. **Legal-format rules:** pointer to the skills; never invent statutory text; every legal paragraph comes from a versioned template.
8. **AI rules:** pseudonymise before LLM calls; log tokens and cost per case; never let an LLM decide amounts (amounts are computed in code).
9. **Definition of Done:** tests green, security-reviewer sign-off, docs updated, STATUS.md updated.
10. **Agent routing:** which subagent owns which folder.

---

## B. Requirements Summary, Open Questions and Next Steps

### B1. Functional requirements

| Area | Requirement |
|---|---|
| Inputs | Scanned PDFs: loan application, sanction letter, interest certificate, demand notice (if any), financial and guarantor details, account statement (outstanding, NPA date, repayment history) |
| Bulk intake | Upload e.g. 100 pages covering 10 loans → auto-classify page type → split into cases (by account no., borrower name, branch) → human confirms the split |
| Extraction | Structured fields with confidence and source-page link; Drafter verifies fields below the confidence threshold |
| Outputs | (1) Demand notice (one click, bulk); (2) plaint; (3) vakalatnama; (4) verification/affidavit/statement of truth, stamp-paper-ready; (5) BBE Act 2026 certificate draft for the bank officer; (6) e-filing bundle (bookmarked, OCR-searchable PDF/A, compliant file names); later (7) DRT OA |
| Languages | English, Marathi, or bilingual; configurable per template |
| Formatting | Per-client profile (font, size, margins, headers, court title blocks) |
| Roles | Admin, Field, Drafter, Approver; separate logins; each sees only their tasks; Approver must differ from Drafter |
| Lifecycle | Bank call → case → scans → AI extraction → demand notice → draft → approval → notary/stamp → e-filing → status tracking |
| Governance | Full audit trail, daily backups, file-wise export (ZIP of PDFs + JSON) any time |
| Platform | Desktop web app; Field gets a responsive/PWA task view; no native app |

### B2. Legal-content requirements (what each template must contain)

| Document | Key 2026 requirements to encode |
|---|---|
| **Plaint (money recovery)** | Order VII Rule 1 particulars (court; parties with descriptions; cause of action and date; jurisdiction; valuation for jurisdiction and court fee; relief; interest). If filed as a summary suit, the title must carry "(Under Order XXXVII of the Code of Civil Procedure, 1908)" and a specific averment. Order XIII-A summary judgment does not apply to suits originally filed under Order XXXVII. | [subodhbajpai](https://www.subodhbajpai.in/blog/order-37-cpc-summary-suit-money-recovery)
| **Commercial-court check** | Bank lending is an "ordinary transaction of bankers/financiers" under Sec 2(1)(c)(i) of the Commercial Courts Act; the Bombay HC (SBI v. Bombay Iron & Steel Labour Board, June 2024) held a banker-customer recovery dispute to be commercial. [lawtext](https://www.lawtext.in/judgement.php?bid=1233) [subodhbajpai](https://www.subodhbajpai.in/blog/order-37-cpc-summary-suit-money-recovery) Specified value is ₹3 lakh or more, counting principal plus interest up to filing. [raizadaassociates](https://www.raizadaassociates.com/blog/section-12a-pre-institution-mediation-commercial-suit) [verdictum](https://www.verdictum.in/court-updates/high-courts/2024bhc-os8690-bombay-iron-steel-labour-board-vs-state-bank-of-india-commercial-suit-1541090) [indiankanoon](https://indiankanoon.org/doc/120672206/) If commercial and no urgent interim relief is sought, **Sec 12A pre-institution mediation is mandatory**: the Supreme Court in Patil Automation v. Rakheja Engineers ((2022) 10 SCC 1, 17 Aug 2022) held that any suit filed in breach of Section 12A "must be visited with rejection of the plaint under Order VII Rule 11", even suo motu, for suits filed from August 2022. Mediation goes through the Legal Services Authority (Form-1, ₹1,000 fee under the PIMS Rules 2018). The software needs a "12A mediation" stage, a mediation-application template, and a field for the failure/non-starter report. |
| **Verification / statement of truth** | Ordinary suits: CPC verification. Commercial suits: statement of truth in the Commercial Courts format (the bank officer's oath and notarisation stay physical). |
| **Court fee (Maharashtra)** | Schedule I Art. 1 slab: ₹6,430 at ₹1 lakh; +₹200 per ₹10,000 up to ₹11 lakh; +₹1,200 per ₹1 lakh above that. Examples: ₹3L → ₹10,430; ₹5L → ₹14,430; ₹10L → ₹24,430; ₹15L → ₹31,230; ₹20L → ₹37,230. [indiacode](https://upload.indiacode.nic.in/schedulefile?aid=AC_MH_166_855_00063_00063_1616477497342&rid=1066) [s3waas](https://cdnbbsr.s3waas.gov.in/s36a4cbdaedcbda0fa8ddc7ea32073c475/uploads/2025/02/202502101485533167.pdf) The cap (₹3 lakh in older texts, reportedly ₹10 lakh after the 2018 amendment) is irrelevant below ₹20 lakh. [punjabtodaynews](https://www.punjabtodaynews.com/high-court-ignoring-fee-law/) [sooperkanoon](https://sooperkanoon.com/act/65689/bombay-court-fees-act-1959-maharashtra-schedule-i) |
| **Vakalatnama (Maharashtra)** | Advocates' Welfare Fund stamp of ₹20 (Maharashtra Advocates Welfare Fund Act s.18(1), raised from ₹2 in 2015); no vakalatnama can be received without it; the cost cannot be recovered from the client. [indiacode](https://www.indiacode.nic.in/bitstream/123456789/17276/3/maharashtra_advocates.pdf) Court-fee stamp ₹10 in subordinate courts (₹15 in the High Court) under Schedule II. [indiankanoon](https://indiankanoon.org/doc/18291589/) Some 2026 websites quote ₹25–100 for the welfare stamp; the statute says ₹20, so confirm with the Bar Council before printing. [jurigram](https://jurigram.com/advocates/resources/bar-council/advocate-welfare-fund-stamps-rules) |
| **Bankers' books certificate** | **Changed:** the Bankers' Books Evidence Act, 2026 (assent 13 Aug 2026, in force 1 Oct 2026) repeals the 1891 Act. It covers physical, electronic and cloud records and sets **two certification tracks (First Schedule for physical records, Second Schedule for electronic records)**, signed manually or by digital/e-signature. [punjabkesari](https://english.punjabkesari.com/india/bankers-books-evidence-act-2026-to-come-into-force-from-oct-1) [a2ztaxcorp](https://a2ztaxcorp.net/bankers-books-evidence-act-2026-to-come-into-force-from-1-october-modernising-and-simplifying-the-use-of-banking-records-as-evidence-in-legal-proceedings/) [elplaw](https://elplaw.in/wp-content/uploads/2026/08/New-Bankers-Books-Evidence-Act.pdf) Old Sec 2A content (branch-manager certificate plus computer-system safeguards certificate) is a useful reference, but new filings should use the Second Schedule format. [rbi](https://rbidocs.rbi.org.in/rdocs/notification/PDFs/ExtractfromtheBankers.pdf) [lawgist](https://lawgist.in/bankers-books-evidence-act/2A) Get the gazette text before finalising the template. |
| **Demand notice** | No statutory form for civil recovery. Include: bank/branch, borrower and guarantors, facility, sanction date and amount, default/NPA date, outstanding with interest computation, demand to pay within a stated period (15 days is common practice), consequences (civil suit, costs, interest, and the 12A mediation invitation if commercial), and mode of service (RPAD/speed post + email). [credgenics](https://www.credgenics.com/litigation-management-system) Keep it distinct from SARFAESI 13(2) notices. |
| **E-filing (Maharashtra district courts)** | Bombay HC e-Filing Rules 2022: A4; margins top/bottom 1.5", left 1.75", right 1.0"; Times New Roman 14 at 1.5 spacing (Unicode 14 for Marathi); OCR-searchable PDF/PDF-A (PDF/A preferred); scans at 300 DPI; file names of 45 characters or fewer; no watermark or encryption; digitally signed or Aadhaar eSigned; court fee paid online, through designated counters or through vendors, with the transaction ID entered at filing. [s3waas](https://cdnbbsr.s3waas.gov.in/s3ec0231c0c178a9fc26ffecffd8670e6d/uploads/2023/04/2023040383.pdf) The national eCourts manual cites 25 MB per document (2018). [ecourts](https://ecourts.gov.in/ecourts_home/static/manuals/efiling-User-manual.pdf) **SHCIL as Maharashtra's e-court-fee agency could not be confirmed**, so verify with the court registry. |
| **DRT OA (Phase 4)** | For debts of ₹20 lakh or more (S.O. 4312(E), 6 Sep 2018). [lawlegal](https://lawlegal.in/drt_intro) [racolblegal](https://racolblegal.com/notification-increasing-the-limit-of-drt-from-10-lakh-to-20-lakh/) E-filing is mandatory (G.S.R. 79(E) 2023; G.S.R. 403(E) 23 Jun 2025) with no hard copy. [taxguru](https://taxguru.in/corporate-law/drts-drats-e-filing-of-pleadings-applicants-mandatory.html) [drt](https://drt.gov.in/images/efiling_notice.pdf) [taxscan](https://www.taxscan.in/top-stories/e-filing-now-mandatory-for-debt-recovery-and-appellate-tribunals-finance-ministry-1426118) Fee: ₹12,000 up to ₹10 lakh, +₹1,000 per lakh above, max ₹1.5 lakh. [tn](https://drt1chennai.tn.nic.in/FAQs.htm) [indiacode](https://upload.indiacode.nic.in/showfile?actid=AC_CEN_2_33_00045_199351_1524048948493&type=rule&filename=Debts+Recovery+Tribunal+%28Procedure%29+Rules%2C+1993.pdf) DRT SOP: Times New Roman 13, double spacing, A4, left margin 5 cm, right 2.5 cm; OA in Part I (memo of parties, dates, application, affidavits), Part II (vakalatnama), Part III (documents); 25 MB per document, 100 MB total; payment via Bharat Kosh. [drt](https://drt.gov.in/images/efiling_notice.pdf) |

### B3. Open questions for the client

| # | Question | Why it matters |
|---|---|---|
| 1 | Which courts (city civil / district / commercial courts) and districts do you file in? | Templates, court headers, jurisdiction clauses |
| 2 | What share of suits are ₹3 lakh or more, and do you already do 12A mediation? | Workflow stage and template |
| 3 | Do you file as ordinary suits or Order XXXVII summary suits? | Title, averments, prayer |
| 4 | Has each bank issued a new-format BBE Act 2026 certificate yet? | Certificate template |
| 5 | Do bank empanelment letters restrict cloud storage or AI processing of bank data? | Vendor/data-location design |
| 6 | Who holds the DSC and who files on eCourts (Field or Admin)? | Role permissions |
| 7 | Marathi drafts: which courts accept or require them? | Language defaults |
| 8 | What is the current time per suit, per stage (for ROI)? | ROI presentation |
| 9 | ICICI empanelment timeline? | Bank template order |

### B4. Next steps

| Step | Owner | When |
|---|---|---|
| Send the Promenix NDA (mutual; covers subcontractors/AI processors) | Promenix | Week 0 |
| Receive 1 old/standard sample file (redacted if possible) + format preferences | Client | After NDA |
| Time-and-motion study of 3–5 suits | Promenix + client clerk | Week 1 |
| Demo with sample file + fake data | Promenix | End of Week 4 |
| ROI and pricing presentation | Promenix | With demo |
| ICICI empanelment | Client | In parallel; not a blocker for the build |

### B5. NDA essentials (software vendor handling legal data)
Definition of confidential information (including borrower PII and bank documents); purpose limitation; a named list of permitted sub-processors (Supabase, Vercel, Sarvam, Anthropic/Google); data location; security standard (encryption, MFA, RLS, audit); breach notice to the client within 24 hours, so the client can meet DPDP's 72-hour Board reporting; return/deletion on termination with a certificate; no training of AI models on client data; Promenix IP ownership of the platform vs client ownership of case data; staff confidentiality undertakings; survival of 5+ years; Maharashtra jurisdiction/arbitration. [veritect](https://veritect.ai/digital-data-ai-law/dpdp-rules-2025-phased-rollout)

---

## C. Architecture, Tech Stack, Schema and Security

### C1. Stack choices

| Layer | Free-tier MVP / demo | Production (pilot onwards) | Notes |
|---|---|---|---|
| Web app | Next.js on **Vercel Hobby** | Next.js on **Vercel Pro** ($20/month per deploying seat, includes $20 usage credit) | Hobby is limited to personal, non-commercial use, so move to Pro before billing the client. [figment](https://figment.so/blog/vercel-pricing) [temps](https://temps.sh/blog/vercel-pricing-complete-guide-2026) Hostinger is fine for the marketing site or as a VPS. |
| DB/Auth/Storage | **Supabase Free** (500 MB DB, 1 GB storage, 50k MAU, 2 projects; pauses after 7 days idle; no backups) [uibakery](https://uibakery.io/blog/supabase-pricing) [nocode](https://www.nocode.mba/articles/supabase-pricing) [cloudzero](https://www.cloudzero.com/blog/supabase-pricing/) | **Supabase Pro** ($25/month; 8 GB DB, 100 GB storage, 100k MAU, daily backups with 7-day retention, $10 compute credit) [metacto](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance) [automationatlas](https://automationatlas.io/answers/supabase-pricing-explained-2026/) [stackrev](https://www.stackrev.net/en/hosting-platforms/supabase-pricing) | Pick the Mumbai (ap-south-1) region. Realistic Pro bills with a larger compute tier run $90–120/month. Team plan ($599) only if SOC 2/SSO is demanded. [cloudzero](https://www.cloudzero.com/blog/supabase-pricing/) [scored](https://scored.tools/blog/supabase-pricing-free-tier-vs-pro-plan-2026/) |
| Scan storage | Supabase Storage (private bucket) | Supabase Storage + weekly encrypted offsite copy | ~15 pages × ~300 KB ≈ 4.5 MB per case, so 500 cases ≈ 2.3 GB/month |
| Job queue | Supabase Queues (pgmq) + one worker | pgmq + worker(s) on a VPS (Hostinger or similar), Docker | OCR and PDF jobs run longer than serverless timeouts |
| Doc generation | docxtemplater/python-docx-template → LibreOffice headless → PDF/A-2b; OCRmyPDF for scans; qpdf/pikepdf for bookmarks and merging | Same, scaled horizontally | Embed Noto Serif Devanagari for Marathi. Use licensed Times New Roman on the server, or metric-compatible Liberation Serif if the court accepts it. |
| OCR (Indic) | **Sarvam Document Digitization**: ₹0.50/page; Extraction API ₹1/page; max 10 pages/job [sarvam](https://docs.sarvam.ai/api-reference-docs/pricing) | Sarvam primary; **Google Document AI Enterprise OCR** ($1.50 per 1,000 pages; first 1,000 pages/month free) as fallback | Sarvam's own API docs set a rate limit of 10 requests/minute on all plans (10 pages per PDF), a bottleneck at the 10-office scale; the ₹0.50/page price follows a cut from ₹1.50 announced by Sarvam. Azure Read and AWS Textract are also $1.50 per 1,000 pages. |
| Classification/splitting | Claude Haiku 5.5 ($0.10/$0.50 per million tokens for prompts under 100k) [anthropic](https://www.anthropic.com/claude/haiku) | Same | Cheapest current Claude model [growthcab](https://www.growthcab.com/claude-opus-api-pricing) |
| Extraction and drafting LLM | **Claude Sonnet 5.5** ($2 in / $10 out per million tokens; 50% off via Batch; cache reads $0.10/M) [anthropic](https://www.anthropic.com/claude-haiku-5-5) [anthropic](https://www.anthropic.com/claude/sonnet) | Same; Opus 5.5 ($4/$20) only for hard cases [aifreeapi](https://www.aifreeapi.com/en/posts/claude-api-pricing-per-million-tokens) | Claude's first-party API is global-only (not India-hosted); [claude](https://docs.claude.com/en/docs/about-claude/pricing) see the data-protection section |
| Indic LLM option | Sarvam 105B (≈₹29.28/M input, ₹73.20/M output as of 28 Sep 2026; another tracker lists ₹15/M input) [usagepricing](https://www.usagepricing.com/blueprint/sarvam-ai) [aiproducts](https://aiproducts.in/blog/sarvam-ai-2026-what-indian-businesses-can-use/) | Use for Marathi polishing/translation if quality tests pass | India-hosted. Verify current rates on Sarvam's page. |
| Speech-to-text (optional dictation) | Sarvam Saaras V4: ₹30/hour (₹45 with diarisation), billed per second [smallest](https://smallest.ai/blog/sarvam-ai-speech-to-text-pricing) [marktechpost](https://www.marktechpost.com/2026/09/26/sarvam-ai-releases-saaras-v4-a-speech-to-text-model-for-all-22-indian-languages-and-global-english/) | Same | V4 launched September 2026, 22 Indian languages + English [aiproducts](https://aiproducts.in/blog/sarvam-ai-2026-what-indian-businesses-can-use/) |
| Payments | — | Razorpay: 2% per domestic transaction + 18% GST on the fee (≈2.36% effective), no setup or AMC; Subscriptions add-on | Sources disagree on whether UPI carries the 2% fee, so check your account. [buildmvpfast](https://www.buildmvpfast.com/alternatives/razorpay) [appadvisor](https://appadvisor.in/software/razorpay) Large B2B invoices should be paid by NEFT/RTGS to avoid ≈2.36%. |
| Notifications | Email (transactional provider free tier) | Email + WhatsApp Business API templates for task alerts | Never put PII in WhatsApp/SMS bodies; send a link to the app instead |

### C2. Processing pipeline
1. Upload (bulk PDF) → stored encrypted → `ingest` job queued.
2. Worker splits the PDF into pages → Sarvam OCR (batches of 10 pages, ≤10 requests/min, with retries; Google fallback). [sarvam](https://docs.sarvam.ai/api-reference-docs/pricing) [buildfastwithai](https://blog.buildfastwithai.com/sarvam-vision-2-1-review)
3. Haiku classifies each page (sanction letter / statement / KYC / guarantor / interest certificate / other) and extracts the case key (account no., borrower).
4. Clustering into cases → **human confirms the split** (Admin/Drafter).
5. Sonnet extracts the JSON schema per case with a source page for each field → validation in code (dates, amounts, IFSC/account formats) → fields below the confidence threshold are flagged.
6. **Amounts and court fee are computed in code** (interest calculator, Maharashtra court-fee function), never by the LLM.
7. Drafts are rendered from versioned DOCX templates. The LLM writes only narrative paragraphs (facts, cause of action), using placeholders such as `{{BORROWER_1}}`; real names are substituted server-side.
8. Approver reviews a side-by-side view (draft vs source pages) → approves or returns → PDF/A + bookmarks → e-filing bundle ZIP.

### C3. Database schema outline (Postgres / Supabase)

| Table | Key columns |
|---|---|
| `organizations` | id, name, gstin, plan, format_profile_id |
| `users` / `profiles` | id (auth.users), org_id, full_name, phone, mfa_enrolled |
| `user_roles` | user_id, org_id, role (admin/field/drafter/approver) |
| `banks` | id, name, short_code, bbe_certificate_template_id |
| `bank_branches` | id, bank_id, branch_name, address, ifsc |
| `courts` | id, name, district, court_type (civil/commercial/DRT), efiling_code, header_template |
| `cases` | id, org_id, bank_branch_id, court_id, case_no_internal, status (enum lifecycle), suit_type (ordinary/O37/commercial), claim_amount_paise, specified_value_paise, is_commercial, needs_12a, assigned_drafter, assigned_approver, cnr_no, filing_no |
| `parties` (borrowers/guarantors) | id, case_id, role (borrower/co-borrower/guarantor), name, father_name, address, pan_enc, aadhaar_last4, dob_enc, phone_enc |
| `loans` | id, case_id, account_no_enc, facility_type, sanction_date, sanction_amount_paise, roi, npa_date, outstanding_paise, interest_upto_date |
| `documents` | id, case_id (nullable until split), batch_id, storage_path, sha256, page_count, doc_type, uploaded_by |
| `document_pages` | id, document_id, page_no, ocr_text_enc, class, class_confidence, case_key |
| `extracted_fields` | id, case_id, field_key, value_enc, confidence, source_page_id, verified_by, verified_at |
| `templates` | id, org_id, bank_id, court_id, doc_kind, language (en/mr/bi), version, docx_path, active |
| `format_profiles` | id, org_id, font, size, margins, line_spacing, header_json |
| `drafts` | id, case_id, doc_kind, language, template_version, status, current_version |
| `draft_versions` | id, draft_id, version, docx_path, pdf_path, created_by, diff_summary |
| `approvals` | id, draft_id, approver_id, decision, comments, created_at (CHECK approver ≠ draft author) |
| `tasks` | id, case_id, assignee_id, role, kind (collect_docs/notary/efile/draft/approve), due_at, status |
| `notices` | id, case_id, dispatch_mode, tracking_no, sent_at, served_at |
| `mediations` | id, case_id, authority, applied_at, outcome, report_path |
| `filings` | id, case_id, efiling_no, court_fee_paise, txn_id, filed_at, status |
| `audit_log` | id (bigserial), org_id, actor_id, action, entity, entity_id, before_hash, after_hash, ip, ua, at, prev_hash (hash chain) |
| `usage_events` | id, org_id, case_id, kind (ocr_page/llm_tokens/suit_pack/notice), qty, cost_paise |
| `subscriptions` / `payments` / `invoices` | plan, period, razorpay ids, GST breakup (CGST/SGST/IGST), invoice_no |
| `exports` / `data_requests` | export jobs; DPDP access/erasure requests |

### C4. Security design

| Control | Implementation |
|---|---|
| Encryption in transit | TLS everywhere (Vercel/Supabase default); HSTS |
| Encryption at rest | Supabase disk encryption + **field-level AES-256-GCM** for PAN, account no., DOB, phone and OCR text (keys in Supabase Vault/KMS, rotated yearly) |
| Aadhaar | Store last 4 digits only; mask scans' Aadhaar numbers in generated bundles unless the court needs them |
| RBAC + RLS | Every table has `org_id`. Policies check role and assignment (Drafter sees only assigned cases; Field sees only own tasks). Approver ≠ Drafter enforced by a DB CHECK/trigger, not just the UI. |
| Auth | Supabase Auth, mandatory TOTP MFA for Admin/Approver, 30-minute idle timeout, device/session list |
| Audit | Append-only `audit_log` (no UPDATE/DELETE grants; hash chain); log views/downloads of PII, not just edits |
| Storage | Private buckets; signed URLs with ≤5-minute expiry; virus scan on upload |
| AI data minimisation | Sarvam (India) for OCR; pseudonymise before Claude; no training on data; log every AI call with cost |
| Backups | Supabase Pro daily (7-day retention) + weekly encrypted export to an India-region bucket; quarterly restore drill |
| Testing | RLS test suite (pgTAP), dependency scanning, secret scanning, OWASP ZAP; **CERT-In-empanelled VAPT before production** (banks commonly ask for this) |
| Compliance path | DPDP security safeguards by **13 May 2027**; ISMS-lite policies now; ISO 27001 certification once there are 5–10 offices | [bitscore](https://www.bitscore.in/tools/dpdp-commencement/breach-notification-72-hours)

### C5. Data protection and regulatory position

| Topic | What applies | Action |
|---|---|---|
| DPDP Act 2023 + Rules 2025 | Rules notified 13 Nov 2025 (Gazette G.S.R. 846(E)). Consent Manager provisions from 13 Nov 2026. **Substantive fiduciary duties (notice, security safeguards under Rule 6, breach reporting under Rule 7: detailed report to the Board within 72 hours, notify affected people without delay, rights handling) from 13 May 2027.** Penalties under the Act's Schedule: up to ₹250 crore for failing to implement reasonable security safeguards (Sec 8(5)) and up to ₹200 crore for failing to notify a breach (Sec 8(6)). | The advocate office (and the bank upstream) is the Data Fiduciary; Promenix is a Data Processor under contract. Processing for enforcing a legal claim is largely exempt from consent duties (Sec 17(1)(a)), but security safeguards still apply; confirm with counsel. |
| RBI outsourcing | Commercial Banks – Managing Risks in Outsourcing Directions, 2025 (28 Nov 2025) replaced the 2023 IT-outsourcing Master Direction; they require due diligence, confidentiality, audit/inspection access, sub-contracting control and exit plans. | [teamleaseregtech](https://www.teamleaseregtech.com/updates/article/49986/reserve-bank-of-india-commercial-banks-managing-risks-in-outsourcing-d/) [intellosync](https://intellosync.com/resources/rbi-outsourcing-directions-third-party-risk-banks-nbfcs) Panel advocates are usually engaged for legal services, but banks may impose these terms via empanelment letters. Keep a sub-processor list, an audit-access clause and an exit/export capability ready. |
| Data localisation | DPDP has no blanket localisation (cross-border transfer is allowed except to notified countries), but bank contracts may demand India-only processing. | Supabase Mumbai + Sarvam (India) by default. Claude's direct API is global; if a bank objects, use a regional cloud endpoint (Bedrock/Vertex offer regional endpoints at a premium) or Sarvam-only mode. [claude](https://docs.claude.com/en/docs/about-claude/pricing) |

---

## D. Phased Roadmap

| Phase | Weeks | Scope | Exit criteria |
|---|---|---|---|
| 0. Setup | 0–1 | NDA, sample file, repo + Claude Code setup, fake-data generator, time study | NDA signed; CLAUDE.md, skills and agents committed |
| 1. Demo (free tier) | 1–4 | Single-case upload → OCR → extraction review → demand notice, plaint, vakalatnama, affidavit/statement of truth, BBE 2026 certificate draft (1 bank, English + Marathi) → PDF/A; 4 roles with basic RLS | Live demo on the sample file; drafts accepted by the senior advocate with minor edits |
| 2. Pilot | 5–10 | Bulk upload with split/classify; SBI, UBI, PNB, BoM templates (ICICI when empanelled); maker-checker; audit; tasks + Field PWA; e-filing bundle; court-fee and interest calculators; 12A mediation stage; Supabase Pro + Vercel Pro + worker VPS | 100 real suits processed; ≥90% of fields correct before human review; 0 RLS test failures |
| 3. Production | 11–16 | Scale to 100 suits/day; billing (Razorpay + GST invoices); exports; backups/restore drill; monitoring; VAPT; DPDP runbooks | VAPT closed; restore drill passed; 30-day uptime ≥99.5% |
| 4. DRT OA | Months 5–6 | OA Parts I–III, DRT fee calculator, e-DRT format (Times New Roman 13, 5 cm left margin), DRT courts master [drt](https://drt.gov.in/images/efiling_notice.pdf) | First OA filed on e-DRT |
| 5. Multi-office SaaS | Month 6+ | Self-serve onboarding, per-tenant templates, ISO 27001 prep | 3+ paying offices |

---

## E. Budget, Costs and Pricing

*Assumptions: ₹88 per US$; 15 pages per case; per-case AI cost ≈ ₹35 (Sarvam OCR ₹7.50 + Claude extraction/drafting with retries and bilingual output ≈ ₹20–25 + classification/notifications/storage ≈ ₹3–5). Optimisation (Batch API, caching, Haiku/Sarvam LLM) can bring this to ₹20–25 at scale.*

### E1. One-time development cost (Promenix internal)

| Item | Effort | Cost estimate |
|---|---|---|
| Lead full-stack developer (Promenix) | 16 weeks | ₹2.0–3.0 lakh (internal loaded cost) |
| Second developer (frontend/docgen) | 10 weeks | ₹1.2–1.8 lakh |
| QA / test (part-time) | 4 weeks | ₹0.4–0.6 lakh |
| Legal template validation (client's junior advocate, paid or in-kind) | 2–3 weeks equivalent | ₹0.3–0.5 lakh |
| Claude Code (Max plan $100–200/month per developer) + tools | 4 months | ₹0.7–1.4 lakh |
| VAPT (external, CERT-In empanelled) | one-time | ₹0.5–1.0 lakh (market estimate; get quotes) |
| **Total** | | **≈ ₹5–8 lakh** |

### E2. Monthly running costs at three scales

| Item (₹/month) | Demo (~50 cases) | This client (150) | This client (500) | 10 offices (5,000) | 10 offices (20,000) |
|---|---|---|---|---|---|
| Vercel | 0 (Hobby) | 1,760 (Pro) | 1,760 | 5,280 (3 seats) | 5,280 |
| Supabase | 0 (Free) | 2,200 (Pro) | 3,500 (Pro + compute) | 10,000 | 18,000 |
| Worker VPS + backups + email + domain | 100 | 3,000 | 3,300 | 15,000 | 22,000 |
| AI (OCR + LLM) | 1,750 | 5,250 | 17,500 | 1,75,000 | 5,00,000 (at ₹25/case) |
| Operations/support time | 0 | 5,000 | 8,000 | 40,000 | 1,00,000 |
| **Total** | **≈ 1,850** | **≈ 17,200** | **≈ 34,000** | **≈ 2,45,000** | **≈ 6,45,000** |
| Cost per case | ₹37 | ₹115 | ₹68 | ₹49 | ₹32 |
| **Minimum price per case for 90% gross margin** | ₹370 | ₹1,150 | ₹680 | ₹490 | ₹320 |

**Interpretation:** at this client's volume, any price of ₹1,150 per suit or more clears the 90% target, and the ₹2,000–3,000 the client floated gives 94–96%. The real risk is not margin but **unlimited-use fixed-price deals**: at 100 suits/day (≈2,500/month), AI alone costs ≈₹87,500/month.

### E3. Check of the developer's figures

| Figure | Against the model | Verdict |
|---|---|---|
| ₹60,000 "own cost" (servers etc.) | Covers ≈5 months of infra+AI at 150 suits, or <2 months at 500; excludes ₹5–8 lakh of development effort | Too low as a cost basis; use it only as the setup-infra budget |
| ₹80–90k subscription/initial | ≈1–1.5% of the client's yearly net from suits (150 × ₹15,000 × 12 = ₹2.7 crore) | Fine as a **pilot/onboarding fee**, ruinous as a lifetime price |
| ₹1–1.5 lakh total incl. maintenance | Running costs alone at 150 suits ≈ ₹2.1 lakh/year | Loses money in year 1 unless usage is billed separately |
| ₹2,000–3,000 per suit (client side) | 8–12% of the ₹25,000 bank fee; 13–20% of the ₹15,000 net | Acceptable now; needs volume slabs as the office scales to 100/day |
| SCC Online-style ₹30–40k for 10 years | SCC sells content with near-zero marginal cost; each suit here costs ₹35–115 to process | Only offer a lifetime licence if the client pays cloud and AI costs at actuals |

### E4. Pricing plans (all prices ex-GST; GST 18% extra)

| Plan | Price | Includes | GST-inclusive | Gross margin (at this client's cost) |
|---|---|---|---|---|
| **Pay-per-case** | ₹2,000 per suit pack; ₹100 per standalone demand notice | Notice + plaint + vakalatnama + affidavit/statement of truth + BBE certificate + e-filing bundle | ₹2,360 / ₹118 | ≈94% at 150/month |
| **Monthly – Office** | ₹1,75,000/month | 150 suit packs, unlimited users, notices (fair use 1,000); extra suit ₹800 | ₹2,06,500 | ≈90% |
| **Monthly – Scale** | ₹3,50,000/month | 500 suit packs; extra suit ₹600 | ₹4,13,000 | ≈90% |
| **Yearly** | 10× monthly (2 months free): Office ₹17.5 lakh; Scale ₹35 lakh | As above, prepaid | ₹20.65 lakh / ₹41.3 lakh | ≈88–90% (offset by upfront cash and no collection risk) |
| **Multi-year/lifetime licence** | ₹12 lakh one-time (perpetual licence, dedicated deployment) | Client pays cloud and AI at actuals on its own accounts | ₹14.16 lakh | ≈100% on Promenix costs (excl. AMC labour) |
| **Partnership / revenue share** | ₹0 setup; 6% of each bank fee received (≈₹1,500 on ₹25,000), paid in the same stages as the bank pays; ₹500 minimum at filing | All features; Promenix may resell to other offices | ₹1,770 per suit (on ₹1,500) | ≈92%; cash-flow risk from late bank payments |
| **AMC** (licence/one-time models only) | 20% of licence fee/year (e.g. ₹2.4 lakh on ₹12 lakh) | Updates, template changes for law changes (e.g. BBE 2026), support | ₹2.83 lakh | — |
| **Referral commission** | 10% of the first 12 months' fees to the introducer | Built into price, not added on top | — | Reduces year-1 margin by ~10 points |

### E5. Recommended offer for this client

1. **Pilot (60 days): ₹90,000 + ₹16,200 GST = ₹1,06,200** one-time onboarding. Includes 4 bank templates (ICICI added free when empanelled), English/Marathi, format profile, training, and up to 150 suit packs during the pilot. This honours the ₹80–90k figure already quoted.
2. **After the pilot: usage plan.** ₹1,500 per suit pack for the first 150/month, ₹1,000 for suits 151–500, ₹600 above 500; demand notices free up to 3× suit volume, then ₹100. **Minimum ₹1,00,000/month** (₹1,18,000 with GST). At 150 suits the bill is ₹2.25 lakh (≈92% margin); at 2,500 suits it is ₹17.75 lakh, which is only ≈4.7% of the client's net at that volume.
3. **AMC included** while the usage plan is active. **Revenue share (6%)** as the alternative if the client prefers no fixed minimum.
4. Data export any time and a 90-day exit assistance clause, which removes lock-in fear.

### E6. Manpower/ROI comparison template (fill in after the time study)

| Stage | Manual hours/suit (assumed) | With software (assumed) | Saved |
|---|---|---|---|
| Reading documents, noting data | 1.00 | 0.25 (verify extraction) | 0.75 |
| Demand notice | 0.50 | 0.05 | 0.45 |
| Plaint drafting | 2.00 | 0.50 (review) | 1.50 |
| Vakalatnama, affidavit, BBE certificate | 0.75 | 0.10 | 0.65 |
| Formatting, PDF, e-filing bundle | 0.75 | 0.10 | 0.65 |
| Checking/approval | 0.50 | 0.25 | 0.25 |
| **Total** | **5.50** | **1.25** | **4.25** |

At 150 suits/month: 638 hours saved ≈ 3.6 staff (176 h/month); at ₹25,000/month per staff (assumption) that is ≈₹90,000/month. At 100 suits/day (2,500/month): manual work needs ≈78 staff vs ≈18 with the software. The software is what makes the scale-up target feasible, and it pays for itself even at the full pay-per-case price.

### E7. Competitor and market scan

| Player | Focus | Relevance | Pricing |
|---|---|---|---|
| Credgenics | Lender-side collections SaaS; legal-notice automation, Sec 138, SARFAESI, DRT/arbitration workflows | Sells to banks, not panel advocates; could become a channel or a threat | Custom enterprise quotes, no public list | [dista](https://dista.ai/blog/best-debt-collection-software/) [productgrowth](https://productgrowth.in/tools/banking-api/credgenics/)
| Presolv360 | ODR (mediation/arbitration); empanelled as a Mediation Institute by the Bombay High Court; its seed-round release cited 35+ enterprises (banks, NBFCs, corporates, startups), and later releases cite 70+ | Relevant for 12A mediation partnerships | Not public |
| Jupitice | Private "digital court" ODR | Indirect | Not public | [ecourtsindia](https://blogs.ecourtsindia.com/2026/04/16/the-complete-list-of-legaltech-startups-and-companies-in-india-2026-directory/)
| SpotDraft | Contract lifecycle management | Not litigation drafting | Not public / seat-based |
| Provakil | Litigation and case management | Tracking, not bank-suit drafting | Not researched in detail |
| SCC Online, Manupatra, LegitQuest | Legal research databases | Complementary; the client already subscribes to SCC | Subscriptions | [ecourtsindia](https://blogs.ecourtsindia.com/2026/04/16/the-complete-list-of-legaltech-startups-and-companies-in-india-2026-directory/)

**Gap:** no product found that drafts complete Maharashtra civil-court money-suit packs (notice to e-filing bundle) in English and Marathi for panel advocates. That is Promenix's niche.

---

## F. Master Prompt for Claude Code (paste into the first session)

```
# ROLE
You are the lead engineer for "Civil Suits", a secure web app built by Promenix Softech LLP for a
Maharashtra advocate office that files bank loan-recovery civil suits (loans < ₹20 lakh) for SBI,
Union Bank of India, PNB, Bank of Maharashtra (ICICI later). Work through the subagents in
.claude/agents and follow CLAUDE.md and the project skills. Plan first (plan mode), then build in
small, tested increments. Ask before any irreversible action.

# GOALS (MVP = Phase 1 demo, then Phase 2 pilot)
1. Upload scanned PDFs (single case or bulk: e.g. 100 pages = 10 cases), auto-classify pages,
   split into cases, human confirms split.
2. OCR (Sarvam Document Digitization API, ≤10 pages/job, ≤10 req/min, retry + Google Document AI
   fallback) → structured extraction (Claude Sonnet 5.5, JSON schema, per-field confidence and
   source page) → Drafter verifies.
3. Generate, from versioned DOCX templates, in English / Marathi / bilingual:
   (a) demand notice (one-click and bulk), (b) plaint (ordinary / Order XXXVII summary /
   commercial), (c) vakalatnama (Maharashtra; ₹20 welfare stamp + court-fee stamp boxes),
   (d) verification / affidavit / statement of truth (stamp-paper-ready layout),
   (e) Bankers' Books Evidence Act 2026 certificate draft (Second Schedule, electronic records),
   (f) Section 12A pre-institution mediation application (if commercial and claim ≥ ₹3 lakh),
   (g) e-filing bundle: OCR-searchable PDF/A, bookmarked, file names ≤45 chars, no watermark/
   encryption, A4, TNR 14, 1.5 spacing, margins T/B 1.5" L 1.75" R 1.0", Marathi in Unicode 14.
4. Maker-checker workflow with 4 roles and full audit trail; per-client format profiles; file-wise
   export (ZIP of PDFs + JSON) at any time.

# ROLES (separate accounts; each sees only own tasks)
- admin: creates cases, assigns work, full pipeline dashboard, settings, templates, users.
- field: mobile-friendly PWA view of own tasks only (collect docs, notary, e-filing status).
- drafter: verifies extracted data, generates and edits drafts for assigned cases.
- approver: reviews and approves/returns; MUST NOT be the drafter of that draft (enforce in DB).

# LIFECYCLE (cases.status enum)
bank_call → case_created → docs_uploaded → extraction_review → notice_generated → notice_sent →
[mediation_12a] → drafting → in_approval → approved → notary_stamp → efiling_ready → filed →
listed/disposed.

# STACK
- Next.js (App Router, TypeScript strict, Tailwind + shadcn/ui), deployed on Vercel.
- Supabase: Postgres + RLS + Auth (TOTP MFA) + Storage (private buckets) + Queues (pgmq),
  Mumbai region. Free tier for demo; Pro for pilot.
- Worker (Docker on VPS): Node or Python; LibreOffice headless (DOCX→PDF/A-2b), OCRmyPDF,
  qpdf/pikepdf (merge, bookmarks), Noto Serif Devanagari + Times New Roman/Liberation Serif.
- AI: Sarvam Vision (OCR), Claude Haiku 5.5 (page classification), Claude Sonnet 5.5
  (extraction + narrative paragraphs). Wrap all AI calls in one module that logs tokens/pages/cost
  to usage_events.

# SCHEMA (create via migrations; every table has org_id, created_at, updated_at)
organizations, profiles, user_roles, banks, bank_branches, courts, cases, parties (borrower/
co-borrower/guarantor), loans, documents, document_pages, extracted_fields, templates,
format_profiles, drafts, draft_versions, approvals, tasks, notices, mediations, filings,
audit_log (append-only, hash chain), usage_events, subscriptions, payments, invoices, exports,
data_requests. Money in paise (bigint). Sensitive columns (*_enc) encrypted with AES-256-GCM.

# SECURITY RULES (non-negotiable)
- RLS enabled on every table; deny by default; policies by org_id + role + assignment.
- CHECK/trigger: approvals.approver_id <> drafts.created_by.
- audit_log: insert-only for app roles; log create/update/delete/view/download/export/login.
- Signed URLs ≤5 min; no public buckets; virus-scan uploads.
- Aadhaar: store last 4 digits only. PAN, account no, DOB, phone encrypted.
- Before sending text to Claude, replace names/PAN/account/Aadhaar with placeholders
  ({{BORROWER_1}}, {{ACCOUNT_1}}); substitute real values server-side after generation.
- Amounts, interest and court fee are computed in code, never by the LLM.
- No secrets in client code; env vars only on server; never commit .env.
- Use only synthetic data in repo, tests, seeds, screenshots.

# DOMAIN LOGIC TO IMPLEMENT AS PURE, TESTED FUNCTIONS
- maharashtraCourtFee(amountPaise): Schedule I Art.1 — ₹6,430 at ₹1,00,000; +₹200 per ₹10,000
  (or part) up to ₹11,00,000; +₹1,200 per ₹1,00,000 (or part) above; cap configurable.
  Tests: 1L→6,430; 2L→8,430; 3L→10,430; 5L→14,430; 10L→24,430; 11L→26,430; 12L→27,630;
  15L→31,230; 20L→37,230. (Below ₹1 lakh slabs: load from config table, to be verified.)
- isCommercial(claim incl. interest to filing ≥ ₹3,00,000 && lender is bank) → needs12A unless
  urgent interim relief flag.
- interestCalculator(principal, rate, from, to, compounding per sanction terms).
- drtFee(amount): ₹12,000 up to ₹10 lakh; +₹1,000 per lakh or part above; max ₹1,50,000 (Phase 4).
- efilingFileName(caseNo, docKind) ≤45 chars, ASCII-safe.

# TEMPLATES
Store DOCX templates in packages/templates/{bank}/{court_type}/{doc_kind}.{lang}.docx with a
manifest (version, effective_from, legal basis). Plaint must include: court title; suit type
inscription (e.g. "(Under Order XXXVII of the Code of Civil Procedure, 1908)"); parties;
jurisdiction; facts; cause of action with dates; valuation and court fee paragraph; interest;
12A compliance paragraph if commercial; prayer; verification/statement of truth; list of
documents. Never invent statutory text: placeholders marked [[LEGAL_REVIEW]] must be filled by
the advocate.

# PHASED TASKS
Phase 0: repo, CLAUDE.md, skills, agents, hooks, CI (lint, typecheck, unit, pgTAP RLS, e2e),
         fake-data generator (10 synthetic cases, scanned-look PDFs).
Phase 1 (demo): auth + roles; case CRUD; single upload → OCR → extraction review UI with
         source-page viewer; generate notice, plaint, vakalatnama, affidavit, BBE certificate for
         one bank in English + Marathi; PDF/A output; basic dashboard.
Phase 2 (pilot): bulk upload split/classify + confirm UI; all 4 bank templates; maker-checker;
         tasks + Field PWA; audit log viewer; e-filing bundle; 12A stage; exports; Supabase Pro.
Phase 3 (production): billing (Razorpay, GST invoices with CGST/SGST/IGST), usage metering,
         backups + restore script, monitoring, rate limiting, VAPT fixes, DPDP runbooks.
Phase 4: DRT OA module (Parts I–III, TNR 13, double spacing, A4, left 5 cm/right 2.5 cm).

# ACCEPTANCE CRITERIA (demo)
- 10 synthetic cases in one 100-page PDF are split correctly ≥9/10 without manual fix.
- Extraction: ≥95% of required fields correct after Drafter review UI; every field links to
  its source page.
- Generated PDFs open as PDF/A, are text-searchable, have bookmarks, correct margins/fonts, and
  Marathi renders correctly (no broken conjuncts).
- An approver cannot approve own draft (DB test). A drafter cannot read another drafter's case
  (RLS test). Field sees only own tasks (e2e).
- Every state change and PII download appears in audit_log.
- AI cost per case logged and ≤ ₹50.

# TESTING
TDD for domain functions (Vitest/pytest); pgTAP for RLS and constraints; Playwright e2e per role;
golden-file tests for templates (render → text extract → compare); load test: 100 cases queued.

# DO NOT
- Do not use real client data anywhere; do not connect MCP to production.
- Do not let the LLM compute money, dates of limitation, or court fees.
- Do not disable RLS "temporarily"; do not use the service-role key in the browser.
- Do not store full Aadhaar; do not put PII in logs, URLs, WhatsApp/SMS text.
- Do not add a native mobile app; do not over-engineer multi-tenancy UI before Phase 5.
- Do not mark a task done while tests fail; do not skip security-reviewer sign-off.
```

---

## Caveats
- **Law in flux:** the BBE Act 2026 Schedule certificate wording was not read in the original gazette; get it before finalising template (e). Court-fee caps (₹3 lakh vs ₹10 lakh) and the ₹20 welfare-stamp figure have conflicting secondary sources; the statute text was used. [jurigram](https://jurigram.com/advocates/resources/bar-council/advocate-welfare-fund-stamps-rules) [indiacode](https://www.indiacode.nic.in/bitstream/123456789/17276/3/maharashtra_advocates.pdf) [punjabtodaynews](https://www.punjabtodaynews.com/high-court-ignoring-fee-law/) [sooperkanoon](https://sooperkanoon.com/act/65689/bombay-court-fees-act-1959-maharashtra-schedule-i) SHCIL's role in Maharashtra e-court-fee payment, the current Bombay HC upload size limit, and the exact DRT OA form (Rule 4) were not verified.
- **Prices change often:** Claude (Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50), Sarvam (₹0.50/page OCR; its LLM rates differ across trackers; ₹100 vs ₹1,000 signup credits reported), Supabase, Vercel and Razorpay figures are from October 2026 sources and should be re-checked at purchase. [sarvam](https://docs.sarvam.ai/api-reference-docs/pricing) [smallest](https://smallest.ai/blog/sarvam-ai-speech-to-text-pricing) [usagepricing](https://www.usagepricing.com/blueprint/sarvam-ai) [aiproducts](https://aiproducts.in/blog/sarvam-ai-2026-what-indian-businesses-can-use/) [aicredits](https://aicredits.dev/submissions/180-sarvam-ai-1-000-free-api-credits-22-indian-languages-stt-tts-translation) [anthropic](https://www.anthropic.com/claude/haiku) [anthropic](https://www.anthropic.com/claude/sonnet) The ₹88/US$ rate, staff costs, hours per suit, VAPT cost and development effort are planning assumptions.
- **Regulatory interpretation** (DPDP Sec 17 exemption, whether bank outsourcing directions reach panel advocates' vendors) needs confirmation from the client's own counsel and each bank's empanelment terms.
- **Competitor data** is thin: most vendors don't publish prices, and Provakil, SpotDraft and LegitQuest were not researched in depth.
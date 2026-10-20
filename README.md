# Civil Suits

Bank-recovery suit automation for Maharashtra panel-advocate offices — by **Promenix Softech LLP**.

Scanned loan files → OCR + AI extraction → human review → demand notice, plaint, vakalatnama, affidavit / statement of truth, BBE Act 2026 certificate, 12A mediation application → e-filing-ready PDF/A bundle. Four roles (Admin, Field, Drafter, Approver) with maker-checker and a full audit trail.

- Plan & architecture: [`docs/plan.md`](docs/plan.md)
- Current status: [`docs/STATUS.md`](docs/STATUS.md)
- Open client questions: [`docs/open-questions.md`](docs/open-questions.md)
- Rules for AI-assisted development: [`CLAUDE.md`](CLAUDE.md)

## Layout
```
apps/web            Next.js 16 app (App Router, Tailwind)
apps/worker         OCR / PDF worker (Phase 1)
packages/domain     Court fee, 12A check, interest, DRT fee, e-filing names, lifecycle (pure + tested)
packages/templates  Versioned DOCX templates (Phase 1)
supabase/           Migrations + RLS tests
.claude/            Agents, skills, hooks for Claude Code
docs/               Plan, status, ADRs, open questions
```

## Getting started
```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test:unit
pnpm typecheck && pnpm lint
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:db
```
Copy `.env.example` to `apps/web/.env.local` and fill values (never commit it).

**Only synthetic data** in this repository. Real client files stay outside the repo under NDA.

# Demo platform setup

| Piece | Where | State |
|---|---|---|
| Web app | Vercel project `civil-suits` (team "Manoj"), root `apps/web`, functions bom1 | Created, deploys on every push |
| Database | Supabase project `civil-suits-dev`, org "promenix-softech's Org", region ap-south-1 (Mumbai) | **Waiting:** free plan allows 2 active projects |

## Steps

1. **Free a Supabase slot (owner, one click).** Supabase dashboard → project *promenix-softech's Project* (Tokyo, empty: 0 tables, 0 users, 0 files) → Project Settings → General → **Pause project**. Pausing is reversible. Do not touch `niwaraa`.
2. **Create `civil-suits-dev`** in Mumbai (Claude can do this once the slot is free) and apply `supabase/migrations/*.sql`.
3. **Vercel env vars** (owner): `civil-suits` → Settings → Environment Variables
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase → Project Settings → API)
   - Server-only, never `NEXT_PUBLIC_`: `SUPABASE_SECRET_KEY`, later `ANTHROPIC_API_KEY`, `SARVAM_API_KEY`, `FIELD_ENCRYPTION_KEY`
   - Redeploy after adding.
4. **Seed synthetic demo data** from your machine (keys stay local):
   ```bash
   cd apps/web
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... DEMO_PASSWORD='choose-12+-chars' pnpm seed:demo
   ```
   Creates "Demo Advocates (Synthetic)", 10 fake SBI cases and users
   `admin@ / drafter1@ / drafter2@ / approver@ / field@demo.civilsuits.test` (all with DEMO_PASSWORD).
5. **Supabase Auth settings:** disable public sign-ups (Authentication → Sign In / Providers → turn off "Allow new users to sign up"). Users are created by the admin only.

## What the demo shows today
- Court-fee / suit-type calculator (home page).
- Login; dashboard where each role sees only what RLS allows: admin/approver all 10 cases, each drafter 5, field only cases with their tasks.

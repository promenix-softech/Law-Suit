# Demo platform setup

| Piece | Where | State |
|---|---|---|
| Web app | Vercel project `civil-suits` (team "Manoj"), root `apps/web`, functions bom1 | Created, deploys on every push |
| Database | Supabase project `Lawsuit` (ref `ohdtudvmcahdnqnhfqzp`), org "promenix-softech's Org", region ap-southeast-1 (Singapore) | Both migrations applied; 23 tables, RLS on all |

Region note: Singapore is fine for the demo (synthetic data only). For the pilot with real bank data, create the Pro project in Mumbai (ap-south-1) — region cannot be changed later.

Accepted advisor warnings: `current_org_id`, `has_role`, `can_see_case`, `can_edit_case` stay executable by signed-in users because RLS policies call them as the invoking user; they reveal only the caller's own org/roles/visibility. `rls_auto_enable` is Supabase-provided.

## Steps

1. ~~Free a Supabase slot~~ — done (Tokyo project paused).
2. ~~Create project and apply `supabase/migrations/*.sql`~~ — done.
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

# Onboarding a new advocate office (tenant)

Every office is a separate tenant. Its users, courts, banks, cases, files, jobs, invoices and
audit chain carry its `org_id`; RLS shows a user only their own office, and the `same_org`
triggers (migration `20261025000000_tenant_same_org`) make the database refuse any link to
another office's rows or users, even for service-role writes.

One person = one office. An email that already belongs to an office cannot be added to another
one; use a separate email.

## Steps (Promenix, service-role key on a trusted machine only)

```bash
export NEXT_PUBLIC_SUPABASE_URL=...   # project URL
export SUPABASE_SECRET_KEY=...        # never in Vercel / the browser

pnpm --filter web office create --name "Patil & Associates" \
  --admin-email admin@patil-associates.in --admin-name "A. Patil"
# prints the new office id; the admin gets an invitation email

pnpm --filter web office add-court --office <id> --name "Civil Judge Senior Division, Pune" --district Pune --type civil
pnpm --filter web office add-bank  --office <id> --bank "State Bank of India" --code SBI \
  --branch "Shivajinagar, Pune" --ifsc SBIN0001234
pnpm --filter web office add-user  --office <id> --email drafter@patil-associates.in --name "D. Kale" --role drafter
pnpm --filter web office list
```

The office's admin then opens cases and assigns drafters / approvers from the web app.

## Checks before go-live

- Supabase Auth: public sign-ups **off** (users only arrive by invitation).
- Log in as the new admin: the dashboard shows no cases, the palette finds none, Team lists only
  their own people.
- `pnpm test:db` is green (includes the cross-office tests).

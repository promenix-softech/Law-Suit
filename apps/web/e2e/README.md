# End-to-end tests

Browser → app → Supabase Auth, RLS and Storage, as each role (`roles.spec.ts`). They run against a
**local** Supabase stack with synthetic data only, never against a hosted project: they sign in as
the demo roles and upload files.

CI runs them in the `e2e` job of `.github/workflows/ci.yml`. Locally (needs Docker):

```bash
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,mailpit,postgres-meta
```

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY|SECRET_KEY)=')"
```

```bash
export NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY SUPABASE_SECRET_KEY=$SECRET_KEY
```

```bash
export DEMO_PASSWORD="$(openssl rand -hex 16)" && export E2E_PASSWORD="$DEMO_PASSWORD"
```

```bash
pnpm --filter web seed:demo && pnpm --filter web build && pnpm --filter web e2e
```

- `supabase start` applies every migration in `supabase/migrations` to a fresh database (a check in
  itself); `supabase db reset` starts over.
- `-x …` leaves out services the app does not use. Where `public.ecr.aws` is blocked, set
  `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` to pull the same images from Docker Hub.
- A build pointed at `http://127.0.0.1` / `http://localhost` lets the page talk to that stack
  (`next.config.ts`); hosted builds allow `https://*.supabase.co` only.
- The keys printed by `supabase status` are the CLI's fixed local defaults, not secrets.

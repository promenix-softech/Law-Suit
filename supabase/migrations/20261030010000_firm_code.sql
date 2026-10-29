-- Each office (firm) has a short code: its address is <code>.<root domain> and its people sign in
-- there. The code is set by Promenix when the firm is onboarded (organizations has no update
-- policy). The sign-in page may learn a firm's name from its code, nothing else.

alter table public.organizations
  add column slug text unique check (slug ~ '^[a-z][a-z0-9-]{1,29}$');

comment on column public.organizations.slug is 'Firm code: sign-in address <slug>.<root domain>; set by the service role';

create or replace function public.firm_by_code(code text) returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name from public.organizations o
  where o.slug is not null and o.slug = lower(btrim(code))
$$;

revoke execute on function public.firm_by_code(text) from public;
grant execute on function public.firm_by_code(text) to anon, authenticated;

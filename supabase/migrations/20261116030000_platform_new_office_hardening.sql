-- Hardening of 20261116020000 after security review.
-- 1. Opening an office is audited by a trigger (the only writers of audit_log are security-definer
--    triggers), over the whole row, and also when an office is created any other way.
-- 2. platform_seat_admin seats only a login just invited (never confirmed, never signed in).

create or replace function public.audit_org_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, before_hash, after_hash)
  values (new.id, auth.uid(), 'insert', 'organizations', new.id, null,
          encode(extensions.digest(to_jsonb(new)::text, 'sha256'), 'hex'));
  return null;
end $$;
revoke execute on function public.audit_org_insert() from public, anon, authenticated;
create trigger organizations_audit_insert after insert on public.organizations
for each row execute function public.audit_org_insert();

create or replace function public.platform_create_office(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  n text := btrim(coalesce(p_name, ''));
  code text := lower(btrim(coalesce(p_slug, '')));
  new_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin can open an office' using errcode = '42501';
  end if;
  if char_length(n) not between 3 and 120 then
    raise exception 'the office name must be 3 to 120 characters' using errcode = '23514';
  end if;
  if code !~ '^[a-z][a-z0-9-]{1,29}$' then
    raise exception 'the firm code must start with a letter: a-z, 0-9 and -, 2 to 30 characters' using errcode = '23514';
  end if;
  if exists (select 1 from public.organizations where slug = code) then
    raise exception 'this firm code is taken' using errcode = '23505';
  end if;
  insert into public.organizations (name, slug) values (n, code) returning id into new_id;
  return new_id;
end $$;

-- Seats a login the `invite-user` edge function has just invited as an admin of an office the
-- super admin chose. The role row is in that office's audit chain with the super admin as actor.
create or replace function public.platform_seat_admin(p_org uuid, p_user uuid, p_full_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n text := btrim(coalesce(p_full_name, ''));
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin can seat an office admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'no such office' using errcode = '23503';
  end if;
  if exists (select 1 from public.profiles where id = p_user) then
    raise exception 'this login already belongs to an office' using errcode = '23505';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user and u.invited_at > now() - interval '1 day'
                 and u.email_confirmed_at is null and u.last_sign_in_at is null) then
    raise exception 'only a login just invited can be seated' using errcode = '23503';
  end if;
  if char_length(n) not between 2 and 120 then
    raise exception 'enter the full name' using errcode = '23514';
  end if;
  insert into public.profiles (id, org_id, full_name) values (p_user, p_org, n);
  insert into public.user_roles (user_id, org_id, role) values (p_user, p_org, 'admin');
end $$;

-- The super admin opens a new office (firm): name and firm code. Its first admin is invited by the
-- `invite-user` edge function, which accepts a target office only from a super admin.

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
  -- organizations has no org_id column and its audit trigger covers updates only: record the
  -- opening in the new office's own chain.
  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, before_hash, after_hash)
  values (new_id, auth.uid(), 'insert', 'organizations', new_id, null,
          encode(extensions.digest(jsonb_build_object('name', n, 'slug', code)::text, 'sha256'), 'hex'));
  return new_id;
end $$;
revoke execute on function public.platform_create_office(text, text) from public, anon;
grant execute on function public.platform_create_office(text, text) to authenticated;

-- Seats an invited login as an admin of an office the super admin chose (the `invite-user` edge
-- function calls this AS the super admin after sending the invitation). Only a login that has no
-- office yet; the profile and role rows go through the usual audit and same-office triggers.
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
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'no such login' using errcode = '23503';
  end if;
  if exists (select 1 from public.profiles where id = p_user) then
    raise exception 'this login already belongs to an office' using errcode = '23505';
  end if;
  if char_length(n) not between 2 and 120 then
    raise exception 'enter the full name' using errcode = '23514';
  end if;
  insert into public.profiles (id, org_id, full_name) values (p_user, p_org, n);
  insert into public.user_roles (user_id, org_id, role) values (p_user, p_org, 'admin');
end $$;
revoke execute on function public.platform_seat_admin(uuid, uuid, text) from public, anon;
grant execute on function public.platform_seat_admin(uuid, uuid, text) to authenticated;

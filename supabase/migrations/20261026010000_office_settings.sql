-- Office settings are admin business: the office profile (firm, advocates, fee account) and the
-- drafting settings (forum for bank claims, margins) are written only by an office admin through
-- update_office_settings(), and read through office_config() by those who draft, approve or run
-- the office — never by field staff. Every change goes to the audit chain.

alter table public.organizations
  add column settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 4096);

-- Members keep reading the office's name etc.; office_profile and settings are not readable directly.
revoke select on public.organizations from authenticated, anon;
grant select (id, name, gstin, plan, created_at, updated_at) on public.organizations to authenticated;

create or replace function public.office_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('office_profile', o.office_profile, 'settings', o.settings)
  from public.organizations o
  where o.id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('drafter') or public.has_role('approver'))
$$;

create or replace function public.update_office_settings(p_profile jsonb, p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o uuid := public.current_org_id();
begin
  if o is null or not public.has_role('admin') then
    raise exception 'only an office admin can change office settings' using errcode = '42501';
  end if;
  if jsonb_typeof(p_profile) is distinct from 'object' or jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception 'office settings must be JSON objects' using errcode = '23514';
  end if;
  update public.organizations set office_profile = p_profile, settings = p_settings where id = o;
end $$;

-- organizations has no org_id column, so audit_row() cannot log it; this trigger does (org_id = id).
create or replace function public.audit_org_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, before_hash, after_hash)
  values (new.id, auth.uid(), 'update', 'organizations', new.id,
          encode(extensions.digest(to_jsonb(old)::text, 'sha256'), 'hex'),
          encode(extensions.digest(to_jsonb(new)::text, 'sha256'), 'hex'));
  return null;
end $$;
revoke execute on function public.audit_org_row() from public, anon, authenticated;

create trigger organizations_audit after update on public.organizations
for each row execute function public.audit_org_row();

revoke execute on function public.office_config() from public, anon;
revoke execute on function public.update_office_settings(jsonb, jsonb) from public, anon;
grant execute on function public.office_config() to authenticated;
grant execute on function public.update_office_settings(jsonb, jsonb) to authenticated;

comment on column public.organizations.settings is 'Drafting settings (forum for bank claims, margins); admin only via update_office_settings()';

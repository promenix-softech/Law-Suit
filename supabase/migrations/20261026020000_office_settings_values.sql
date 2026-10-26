-- Office settings may only hold the values the app understands (checked again in zod on read).
-- Note for later migrations: since 20261026010000, authenticated reads organizations through a
-- column grant; a new column stays hidden unless a migration grants it explicitly — never
-- re-grant the whole table, which would expose office_profile and settings.
alter table public.organizations
  add constraint organizations_settings_values check (
    (settings ->> 'forum' is null or settings ->> 'forum' in ('summary_suit', 'commercial'))
    and (settings ->> 'margins' is null or settings ->> 'margins' in ('office', 'efiling_rules'))
  );

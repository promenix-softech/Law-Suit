-- India-wide: every court belongs to a state (ISO 3166-2:IN code, e.g. MH, MP). Court-fee law,
-- e-filing format and language follow from it (packages/domain/src/jurisdiction.ts).
-- Existing courts are all in Maharashtra.

alter table public.courts add column state text not null default 'MH'
  check (state ~ '^[A-Z]{2}$');
alter table public.courts alter column state drop default;

comment on column public.courts.state is 'ISO 3166-2:IN state code; drives court-fee law, format and language';

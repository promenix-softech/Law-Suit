-- Office format (from the office's own filed papers, Oct 2026): the extra particulars a
-- bank-recovery suit prints, and the extra papers generated with it.
-- No new tables; every column sits on a table already under RLS with org_id.

-- Papers filed or used with the suit, besides plaint / affidavit / vakalatnama.
alter type public.doc_kind add value if not exists 'address_memo';
alter type public.doc_kind add value if not exists 'draft_decree';
alter type public.doc_kind add value if not exists 'court_fee_letter';
alter type public.doc_kind add value if not exists 'efiling_sheet';

-- Advocates' office details printed on the vakalatnama and the court-fee letter (firm name,
-- advocate code, sanad no., address, advocates, fee account). Only the service role writes
-- it (organizations has no update policy); members read it through org_read.
alter table public.organizations
  add column office_profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(office_profile) = 'object' and pg_column_size(office_profile) < 8192);

-- The bank officer who signs, verifies and swears for the plaintiff (bank staff, not a borrower).
alter table public.cases
  add column signatory_name text check (char_length(signatory_name) <= 200),
  add column signatory_designation text check (char_length(signatory_designation) <= 100),
  add column signatory_age int check (signatory_age between 18 and 100),
  -- Particulars of claim: B (penal interest) and C (expenses); A is loans.outstanding_paise.
  -- null = penal interest not decided yet (the office settles it later; filing is blocked until set, 0 = NIL).
  add column penal_interest_paise bigint check (penal_interest_paise >= 0),
  add column expenses_paise bigint not null default 0 check (expenses_paise >= 0);

-- A firm or company sued through a person: "M/s X, Through its Proprietor Y".
alter table public.parties
  add column through_capacity text check (char_length(through_capacity) <= 50),
  add column through_name text check (char_length(through_name) <= 200),
  add constraint parties_through_both check ((through_capacity is null) = (through_name is null));

-- Per facility: when the borrower applied, for what, and the documents executed for it
-- ([{ "title": "Demand Promissory Note", "date": "2023-07-12" }, …]).
alter table public.loans
  add column application_date date,
  add column purpose text check (char_length(purpose) <= 200),
  -- Repayment period in months (term loans); null for running limits such as cash credit.
  add column tenure_months int check (tenure_months between 1 and 600),
  add column executed_docs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(executed_docs) = 'array' and jsonb_array_length(executed_docs) <= 60);

comment on column public.organizations.office_profile is 'Advocates office details for vakalatnama / fee letter; service role writes only';
comment on column public.loans.executed_docs is 'Documents executed for the facility: [{title, date}] — listed in the plaint and list of documents';

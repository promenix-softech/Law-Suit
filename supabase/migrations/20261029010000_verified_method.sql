-- How a person confirmed an extracted value: one by one, or with the bulk "I compared these
-- with the scan" button (names / addresses / IFSC only). The audit chain hashes every row change,
-- so the method is part of the tamper-evident record. Values verified before this column existed
-- keep null (method not recorded).
alter table public.extracted_fields
  add column verified_method text
    check (verified_method in ('single', 'bulk')),
  add constraint extracted_fields_method_needs_verification
    check (verified_method is null or verified_at is not null);

comment on column public.extracted_fields.verified_method is 'single | bulk — how verified_by confirmed the value; null if unverified or verified before 29 Oct 2026';

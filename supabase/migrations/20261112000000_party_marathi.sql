-- Marathi name and address of a party, for papers written in Marathi (the Marathi demand notice).
-- A person types them from the bank's file; code never transliterates a name. They sit on the
-- existing parties row, so its RLS policies, audit trigger and same-office check already apply.
alter table public.parties
  add column name_mr text check (name_mr is null or char_length(name_mr) between 1 and 200),
  add column address_mr text check (address_mr is null or char_length(address_mr) between 1 and 500),
  add column through_name_mr text check (through_name_mr is null or char_length(through_name_mr) between 1 and 200);

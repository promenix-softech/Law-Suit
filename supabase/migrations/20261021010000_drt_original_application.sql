-- DRT Original Application (RDB Act s.19) as a draft kind. Bank debts of ₹20 lakh or more
-- go to the DRT instead of the civil / commercial court.
alter type public.doc_kind add value if not exists 'original_application';

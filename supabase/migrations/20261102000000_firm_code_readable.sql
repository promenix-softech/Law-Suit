-- organizations has column-level SELECT grants (office_profile / settings stay hidden); the firm
-- code added in 20261030010000 was never granted, so sign-in could not read the user's own firm
-- and refused every account. Members may read their own office's code (org_read still applies).
grant select (slug) on public.organizations to authenticated;

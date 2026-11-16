-- Invoices from the super admin's console. Amounts are computed in packages/domain (billing.ts)
-- by the web server; these functions check who calls, check that the numbers add up, give the
-- next invoice number under a lock, and keep invoices immutable (trigger invoices_immutable).

-- A cancelled invoice no longer holds its period: the period can be invoiced again.
alter table public.invoices drop constraint invoices_org_id_period_start_key;
create unique index invoices_one_live_per_period on public.invoices (org_id, period_start) where status <> 'cancelled';

-- The super admin may count an office's billable suit packs too.
create or replace function public.billable_suit_packs(org uuid, p_start date, p_end date)
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from (
    select billing_case_id, min(created_at) as first_at from public.usage_events
     where org_id = org and kind = 'suit_pack' and billing_case_id is not null
     group by billing_case_id
  ) f
  where (f.first_at at time zone 'Asia/Kolkata')::date between p_start and p_end
    and (public.current_org_id() = org and public.has_role('admin') or auth.role() = 'service_role'
         or public.is_platform_admin())
$$;

-- Billing plan of an office (prices per suit pack by slab, monthly minimum, GST details).
create or replace function public.platform_set_billing_plan(
  p_org uuid, p_effective_from date, p_slabs jsonb, p_minimum_paise bigint,
  p_recipient_gstin text, p_recipient_state text, p_sac_code text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin can set a billing plan' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'no such office' using errcode = '23503';
  end if;
  if p_sac_code is not null and p_sac_code !~ '^\d{4,8}$' then
    raise exception 'SAC code: 4 to 8 digits' using errcode = '23514';
  end if;
  insert into public.billing_plans (org_id, effective_from, slabs, minimum_paise, recipient_gstin, recipient_state, sac_code)
  values (p_org, p_effective_from, p_slabs, p_minimum_paise, nullif(p_recipient_gstin, ''), p_recipient_state, nullif(p_sac_code, ''))
  on conflict (org_id, effective_from) do update set
    slabs = excluded.slabs, minimum_paise = excluded.minimum_paise, recipient_gstin = excluded.recipient_gstin,
    recipient_state = excluded.recipient_state, sac_code = excluded.sac_code;
end $$;

create or replace function public.platform_billing_plans(p_org uuid)
returns setof public.billing_plans language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin' using errcode = '42501';
  end if;
  return query select * from public.billing_plans where org_id = p_org order by effective_from desc;
end $$;

-- Issues an invoice with the next number of the financial year (IST, April–March).
create or replace function public.platform_issue_invoice(
  p_org uuid, p_prefix text, p_period_start date, p_period_end date, p_lines jsonb,
  p_taxable_paise bigint, p_cgst_paise bigint, p_sgst_paise bigint, p_igst_paise bigint, p_total_paise bigint
) returns table (id uuid, invoice_no text) language plpgsql security definer set search_path = '' as $$
declare
  issued timestamptz := now();
  ist date := (issued at time zone 'Asia/Kolkata')::date;
  fy_start int := case when extract(month from ist) >= 4 then extract(year from ist)::int else extract(year from ist)::int - 1 end;
  v_fy text := fy_start::text || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0');
  seq int;
  inv_no text;
  sum_lines bigint;
  new_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin can issue an invoice' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where organizations.id = p_org) then
    raise exception 'no such office' using errcode = '23503';
  end if;
  if p_prefix !~ '^[A-Z0-9]{1,4}$' then
    raise exception 'invoice prefix: 1 to 4 capital letters or digits' using errcode = '23514';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'an invoice needs 1 to 20 lines' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
     where jsonb_typeof(l -> 'description') is distinct from 'string'
        or char_length(btrim(l ->> 'description')) not between 1 and 200
        or jsonb_typeof(l -> 'qty') is distinct from 'number' or jsonb_typeof(l -> 'ratePaise') is distinct from 'number'
        or jsonb_typeof(l -> 'amountPaise') is distinct from 'number'
        or (l ->> 'qty')::numeric <> trunc((l ->> 'qty')::numeric) or (l ->> 'qty')::numeric < 1
        or (l ->> 'ratePaise')::numeric <> trunc((l ->> 'ratePaise')::numeric) or (l ->> 'ratePaise')::numeric < 0
        or (l ->> 'amountPaise')::numeric <> (l ->> 'qty')::numeric * (l ->> 'ratePaise')::numeric
  ) then
    raise exception 'each line needs a description, a whole quantity and rate, and amount = qty × rate' using errcode = '23514';
  end if;
  select sum((l ->> 'amountPaise')::bigint) into sum_lines from jsonb_array_elements(p_lines) l;
  if sum_lines <> p_taxable_paise then
    raise exception 'the lines do not add up to the taxable value' using errcode = '23514';
  end if;

  -- One numbering sequence across all offices (GST: unique per FY for the supplier).
  perform pg_advisory_xact_lock(hashtext('invoice_no'));
  select count(*) + 1 into seq from public.invoices where invoices.fy = v_fy;
  if seq > 9999 then raise exception 'invoice numbers for this year are used up'; end if;
  inv_no := p_prefix || '/' || v_fy || '/' || lpad(seq::text, 4, '0');

  insert into public.invoices (org_id, invoice_no, fy, period_start, period_end, lines, taxable_paise,
                               cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
  values (p_org, inv_no, v_fy, p_period_start, p_period_end, p_lines, p_taxable_paise,
          p_cgst_paise, p_sgst_paise, p_igst_paise, p_total_paise, issued)
  returning invoices.id into new_id;
  return query select new_id, inv_no;
end $$;

-- Paid (with a payment reference) or cancelled; the trigger keeps it forward-only and once-only.
create or replace function public.platform_set_invoice_status(p_id uuid, p_status text, p_payment_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin can change an invoice' using errcode = '42501';
  end if;
  if p_status not in ('paid', 'cancelled') then
    raise exception 'status must be paid or cancelled' using errcode = '23514';
  end if;
  if p_status = 'paid' and char_length(btrim(coalesce(p_payment_ref, ''))) not between 3 and 60 then
    raise exception 'a payment reference is needed' using errcode = '23514';
  end if;
  update public.invoices set
    status = p_status,
    paid_at = case when p_status = 'paid' then now() else paid_at end,
    payment_ref = case when p_status = 'paid' then btrim(p_payment_ref) else payment_ref end
  where invoices.id = p_id;
  if not found then raise exception 'no such invoice' using errcode = '23503'; end if;
end $$;

-- Invoices of one office, or of all (p_org null), with the office's name.
create or replace function public.platform_invoices(p_org uuid)
returns table (
  id uuid, org_id uuid, office_name text, invoice_no text, fy text, period_start date, period_end date,
  lines jsonb, taxable_paise bigint, cgst_paise bigint, sgst_paise bigint, igst_paise bigint, total_paise bigint,
  status text, paid_at timestamptz, payment_ref text, issued_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin' using errcode = '42501';
  end if;
  return query
    select i.id, i.org_id, o.name, i.invoice_no, i.fy, i.period_start, i.period_end, i.lines, i.taxable_paise,
           i.cgst_paise, i.sgst_paise, i.igst_paise, i.total_paise, i.status, i.paid_at, i.payment_ref, i.issued_at
      from public.invoices i join public.organizations o on o.id = i.org_id
     where p_org is null or i.org_id = p_org
     order by i.issued_at desc;
end $$;

revoke execute on function public.platform_set_billing_plan(uuid, date, jsonb, bigint, text, text, text) from public, anon;
revoke execute on function public.platform_billing_plans(uuid) from public, anon;
revoke execute on function public.platform_issue_invoice(uuid, text, date, date, jsonb, bigint, bigint, bigint, bigint, bigint) from public, anon;
revoke execute on function public.platform_set_invoice_status(uuid, text, text) from public, anon;
revoke execute on function public.platform_invoices(uuid) from public, anon;
grant execute on function public.platform_set_billing_plan(uuid, date, jsonb, bigint, text, text, text) to authenticated;
grant execute on function public.platform_billing_plans(uuid) to authenticated;
grant execute on function public.platform_issue_invoice(uuid, text, date, date, jsonb, bigint, bigint, bigint, bigint, bigint) to authenticated;
grant execute on function public.platform_set_invoice_status(uuid, text, text) to authenticated;
grant execute on function public.platform_invoices(uuid) to authenticated;

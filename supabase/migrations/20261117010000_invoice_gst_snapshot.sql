-- An issued invoice is a tax document: it keeps the GST details it was issued with (recipient
-- GSTIN, place of supply, SAC, supplier GSTIN), so a later change of the office's plan cannot
-- change what an issued invoice says. Also: GST split checked against the place of supply, and
-- the prefix limited to 3 characters (PPP/2026-27/0001 = 16, the column limit).

alter table public.invoices
  add column recipient_gstin text,
  add column recipient_state text check (recipient_state ~ '^(0[1-9]|[1-3][0-9])$'),
  add column sac_code text,
  add column supplier_gstin text;

create or replace function public.invoices_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'invoices cannot be deleted; cancel instead'; end if;
  if (new.org_id, new.invoice_no, new.fy, new.period_start, new.period_end, new.lines, new.taxable_paise,
      new.cgst_paise, new.sgst_paise, new.igst_paise, new.total_paise, new.issued_at,
      new.recipient_gstin, new.recipient_state, new.sac_code, new.supplier_gstin)
     is distinct from
     (old.org_id, old.invoice_no, old.fy, old.period_start, old.period_end, old.lines, old.taxable_paise,
      old.cgst_paise, old.sgst_paise, old.igst_paise, old.total_paise, old.issued_at,
      old.recipient_gstin, old.recipient_state, old.sac_code, old.supplier_gstin) then
    raise exception 'issued invoice amounts are immutable';
  end if;
  if old.status = 'cancelled' then raise exception 'cancelled invoice cannot change'; end if;
  if new.status is distinct from old.status
     and (old.status, new.status) not in (('issued', 'paid'), ('issued', 'cancelled'), ('paid', 'cancelled')) then
    raise exception 'invoice status cannot go from % to %', old.status, new.status;
  end if;
  if (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
     or (old.payment_ref is not null and new.payment_ref is distinct from old.payment_ref) then
    raise exception 'payment details are recorded once';
  end if;
  return new;
end $$;

drop function public.platform_issue_invoice(uuid, text, date, date, jsonb, bigint, bigint, bigint, bigint, bigint);

-- Supplier state is Maharashtra (27): CGST + SGST inside it, IGST outside (amounts from code).
create function public.platform_issue_invoice(
  p_org uuid, p_prefix text, p_supplier_gstin text, p_period_start date, p_period_end date, p_lines jsonb,
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
  plan record;
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin can issue an invoice' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where organizations.id = p_org) then
    raise exception 'no such office' using errcode = '23503';
  end if;
  if p_prefix !~ '^[A-Z0-9]{1,3}$' then
    raise exception 'invoice prefix: 1 to 3 capital letters or digits' using errcode = '23514';
  end if;
  if p_supplier_gstin is not null and p_supplier_gstin !~ '^27[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'supplier GSTIN must be a Maharashtra GSTIN' using errcode = '23514';
  end if;
  select bp.recipient_gstin, bp.recipient_state, bp.sac_code into plan
    from public.billing_plans bp where bp.org_id = p_org and bp.effective_from <= p_period_start
   order by bp.effective_from desc limit 1;
  if not found then
    raise exception 'no billing plan in force for this period' using errcode = '23514';
  end if;
  if plan.recipient_state = '27' and (p_igst_paise <> 0 or p_cgst_paise <> p_sgst_paise)
     or plan.recipient_state <> '27' and (p_cgst_paise <> 0 or p_sgst_paise <> 0) then
    raise exception 'the GST split does not match the place of supply' using errcode = '23514';
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

  perform pg_advisory_xact_lock(hashtext('invoice_no'));
  select count(*) + 1 into seq from public.invoices where invoices.fy = v_fy;
  if seq > 9999 then raise exception 'invoice numbers for this year are used up'; end if;
  inv_no := p_prefix || '/' || v_fy || '/' || lpad(seq::text, 4, '0');

  insert into public.invoices (org_id, invoice_no, fy, period_start, period_end, lines, taxable_paise,
                               cgst_paise, sgst_paise, igst_paise, total_paise, issued_at,
                               recipient_gstin, recipient_state, sac_code, supplier_gstin)
  select p_org, inv_no, v_fy, p_period_start, p_period_end,
         (select jsonb_agg(jsonb_build_object('description', btrim(l ->> 'description'), 'qty', (l ->> 'qty')::bigint,
                                              'ratePaise', (l ->> 'ratePaise')::bigint, 'amountPaise', (l ->> 'amountPaise')::bigint)
                           order by o)
            from jsonb_array_elements(p_lines) with ordinality as x(l, o)),
         p_taxable_paise, p_cgst_paise, p_sgst_paise, p_igst_paise, p_total_paise, issued,
         plan.recipient_gstin, plan.recipient_state, plan.sac_code, p_supplier_gstin
  returning invoices.id into new_id;
  return query select new_id, inv_no;
end $$;
revoke execute on function public.platform_issue_invoice(uuid, text, text, date, date, jsonb, bigint, bigint, bigint, bigint, bigint) from public, anon;
grant execute on function public.platform_issue_invoice(uuid, text, text, date, date, jsonb, bigint, bigint, bigint, bigint, bigint) to authenticated;

drop function public.platform_invoices(uuid);
create function public.platform_invoices(p_org uuid)
returns table (
  id uuid, org_id uuid, office_name text, invoice_no text, fy text, period_start date, period_end date,
  lines jsonb, taxable_paise bigint, cgst_paise bigint, sgst_paise bigint, igst_paise bigint, total_paise bigint,
  status text, paid_at timestamptz, payment_ref text, issued_at timestamptz,
  recipient_gstin text, recipient_state text, sac_code text, supplier_gstin text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only the super admin' using errcode = '42501';
  end if;
  return query
    select i.id, i.org_id, o.name, i.invoice_no, i.fy, i.period_start, i.period_end, i.lines, i.taxable_paise,
           i.cgst_paise, i.sgst_paise, i.igst_paise, i.total_paise, i.status, i.paid_at, i.payment_ref, i.issued_at,
           i.recipient_gstin, i.recipient_state, i.sac_code, i.supplier_gstin
      from public.invoices i join public.organizations o on o.id = i.org_id
     where p_org is null or i.org_id = p_org
     order by i.issued_at desc;
end $$;
revoke execute on function public.platform_invoices(uuid) from public, anon;
grant execute on function public.platform_invoices(uuid) to authenticated;

-- SaaS billing (Promenix → advocate office): per-org plan and GST invoices.
-- Org admins can read their plan and invoices; only the billing script (service_role)
-- writes them. Amounts are computed in packages/domain (billing.ts), never in SQL or by AI.

-- Usage rows feed billing, so app users may only log OCR/LLM usage with positive quantities.
-- Suit packs are written by the worker (service_role) when a bundle is built.
drop policy usage_insert on public.usage_events;
create policy usage_insert on public.usage_events for insert to authenticated
  with check (org_id = public.current_org_id() and case_id is not null and public.can_edit_case(case_id)
              and kind in ('ocr_page', 'llm_tokens') and qty > 0 and cost_paise >= 0);

-- Billing keys on a copy of the case id with no foreign key: deleting a case sets
-- usage_events.case_id to null, but must not remove the case's suit pack from the bill.
alter table public.usage_events add column billing_case_id uuid;
update public.usage_events set billing_case_id = case_id where billing_case_id is null;
create or replace function public.usage_events_billing_case() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.billing_case_id := new.case_id;
  return new;
end $$;
create trigger usage_events_billing_case before insert on public.usage_events
for each row execute function public.usage_events_billing_case();

create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  effective_from date not null,
  -- [{"upTo": 100, "ratePaise": 150000}, …, {"upTo": null, "ratePaise": 60000}]
  slabs jsonb not null check (jsonb_typeof(slabs) = 'array' and jsonb_array_length(slabs) between 1 and 10),
  minimum_paise bigint not null default 0 check (minimum_paise >= 0),
  recipient_gstin text check (recipient_gstin ~ '^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  recipient_state text not null check (recipient_state ~ '^(0[1-9]|[1-3][0-9])$'),
  sac_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, effective_from)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  invoice_no text not null unique check (length(invoice_no) <= 16),
  fy text not null check (fy ~ '^\d{4}-\d{2}$'),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  lines jsonb not null,
  taxable_paise bigint not null check (taxable_paise >= 0),
  cgst_paise bigint not null default 0 check (cgst_paise >= 0),
  sgst_paise bigint not null default 0 check (sgst_paise >= 0),
  igst_paise bigint not null default 0 check (igst_paise >= 0),
  total_paise bigint not null check (total_paise = taxable_paise + cgst_paise + sgst_paise + igst_paise),
  status text not null default 'issued' check (status in ('issued', 'paid', 'cancelled')),
  paid_at timestamptz,
  payment_ref text,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, period_start)
);

alter table public.billing_plans enable row level security;
alter table public.billing_plans force row level security;
alter table public.invoices enable row level security;
alter table public.invoices force row level security;

create trigger billing_plans_updated_at before update on public.billing_plans
for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices
for each row execute function public.set_updated_at();
create trigger billing_plans_audit after insert or update or delete on public.billing_plans
for each row execute function public.audit_row();
create trigger invoices_audit after insert or update or delete on public.invoices
for each row execute function public.audit_row();

-- An issued invoice is a tax document: amounts and number never change; only status/payment.
create or replace function public.invoices_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'invoices cannot be deleted; cancel instead'; end if;
  if (new.org_id, new.invoice_no, new.fy, new.period_start, new.period_end, new.lines, new.taxable_paise,
      new.cgst_paise, new.sgst_paise, new.igst_paise, new.total_paise, new.issued_at)
     is distinct from
     (old.org_id, old.invoice_no, old.fy, old.period_start, old.period_end, old.lines, old.taxable_paise,
      old.cgst_paise, old.sgst_paise, old.igst_paise, old.total_paise, old.issued_at) then
    raise exception 'issued invoice amounts are immutable';
  end if;
  if old.status = 'cancelled' then raise exception 'cancelled invoice cannot change'; end if;
  -- Only forward: issued → paid / cancelled, paid → cancelled; payment details are set once.
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
create trigger invoices_immutable before update or delete on public.invoices
for each row execute function public.invoices_immutable();

create policy billing_plans_read on public.billing_plans for select to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'));
create policy invoices_read on public.invoices for select to authenticated
  using (org_id = public.current_org_id() and public.has_role('admin'));
-- No insert/update/delete policies for app users.

-- Suit packs billable in a period: one per case, in the month its first bundle was built.
create or replace function public.billable_suit_packs(org uuid, p_start date, p_end date)
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from (
    select billing_case_id, min(created_at) as first_at from public.usage_events
     where org_id = org and kind = 'suit_pack' and billing_case_id is not null
     group by billing_case_id
  ) f
  where (f.first_at at time zone 'Asia/Kolkata')::date between p_start and p_end
    and (public.current_org_id() = org and public.has_role('admin') or auth.role() = 'service_role')
$$;
revoke execute on function public.billable_suit_packs(uuid, date, date) from public, anon;
grant execute on function public.billable_suit_packs(uuid, date, date) to authenticated, service_role;

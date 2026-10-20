-- Approval flow, enforced in the database:
--  * a draft becomes approved/returned only through an approvals row (never by direct update);
--  * decisions are accepted only while the draft is in_approval;
--  * the approval applies the decision to the draft (and to the case for plaints).

-- Approvals may only be recorded on drafts awaiting approval.
create or replace function public.enforce_maker_checker() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
  current_status public.draft_status;
begin
  select created_by, status into author, current_status from public.drafts where id = new.draft_id;
  if author is null then
    raise exception 'draft % not found', new.draft_id;
  end if;
  if new.approver_id = author then
    raise exception 'maker-checker violation: approver cannot approve own draft'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.draft_versions
    where draft_id = new.draft_id and created_by = new.approver_id
  ) then
    raise exception 'maker-checker violation: approver edited this draft'
      using errcode = 'check_violation';
  end if;
  if current_status is distinct from 'in_approval' then
    raise exception 'draft is not awaiting approval (status %)', current_status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Apply the decision. Runs as definer because approvers cannot update drafts or cases under RLS.
create or replace function public.apply_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d record;
begin
  update public.drafts
     set status = new.decision::public.draft_status
   where id = new.draft_id
  returning case_id, doc_kind into d;

  if d.doc_kind = 'plaint' then
    update public.cases
       set status = case when new.decision = 'approved' then 'approved' else 'drafting' end::public.case_status
     where id = d.case_id and status = 'in_approval';
  end if;
  return null;
end $$;

create trigger approvals_apply after insert on public.approvals
for each row execute function public.apply_approval();

-- Nobody sets approved/returned on a draft directly; only apply_approval (nested trigger) may.
create or replace function public.guard_draft_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status in ('approved', 'returned')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and pg_trigger_depth() < 2 then
    raise exception 'draft status % can only be set by an approval', new.status
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger drafts_guard_status before insert or update on public.drafts
for each row execute function public.guard_draft_status();

revoke execute on function public.apply_approval() from public, anon, authenticated;
revoke execute on function public.guard_draft_status() from public, anon, authenticated;

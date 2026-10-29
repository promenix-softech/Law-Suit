-- The office admin can do every role except field work, so an admin may also record approvals.
-- Maker-checker is unchanged: enforce_maker_checker still refuses an approval by the draft's
-- author or by anyone who created one of its versions, whatever their role.
drop policy approvals_insert on public.approvals;
create policy approvals_insert on public.approvals for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and approver_id = auth.uid()
    and (public.has_role('approver') or public.has_role('admin'))
  );

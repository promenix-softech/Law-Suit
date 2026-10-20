-- AI/OCR usage is logged by the user who triggered it, for a case they can edit.
-- Rows stay append-only for app users (no update/delete policies).
create policy usage_insert on public.usage_events for insert to authenticated
  with check (org_id = public.current_org_id() and case_id is not null and public.can_edit_case(case_id));

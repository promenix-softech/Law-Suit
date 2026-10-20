-- Spend guard for paid AI calls (Sarvam OCR / extraction): checked before every call.
-- Counts across all of the org's documents, so RLS visibility does not hide earlier jobs.
create or replace function public.ai_quota_ok(per_user_hour int default 60, per_org_day int default 1000)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.ocr_jobs
      where created_by = auth.uid() and created_at > now() - interval '1 hour') < per_user_hour
    and
    (select count(*) from public.ocr_jobs
      where org_id = public.current_org_id() and created_at > now() - interval '1 day') < per_org_day
$$;
revoke execute on function public.ai_quota_ok(int, int) from public, anon;
grant execute on function public.ai_quota_ok(int, int) to authenticated;

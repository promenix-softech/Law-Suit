-- Tenant isolation, defence in depth: every reference from an office's row must point at a row
-- (or a user) of the SAME office. RLS already hides other offices' rows; this makes the database
-- itself refuse cross-office links, including writes by the service role (worker, scripts).

create or replace function public.enforce_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(new);
  prior jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  org uuid := (rec ->> 'org_id')::uuid;
  i int := 0;
  col text;
  target text;
  ref uuid;
  ok boolean;
begin
  -- Arguments come in pairs: column name, then the referenced table ('user' = an app user).
  while i < tg_nargs loop
    col := tg_argv[i];
    target := tg_argv[i + 1];
    i := i + 2;
    ref := (rec ->> col)::uuid;
    continue when ref is null;
    -- Unchanged links on an unchanged office were checked when they were written.
    continue when prior is not null
      and (prior ->> col) is not distinct from (rec ->> col)
      and (prior ->> 'org_id') is not distinct from (rec ->> 'org_id');
    if target = 'user' then
      select exists (select 1 from public.profiles p where p.id = ref and p.org_id = org) into ok;
    else
      execute format('select exists (select 1 from public.%I where id = $1 and org_id = $2)', target)
        into ok using ref, org;
    end if;
    if not ok then
      raise exception '%.% must belong to the same office', tg_table_name, col using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;

revoke execute on function public.enforce_same_org() from public, anon, authenticated;

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('approvals',        array['draft_id','drafts','approver_id','user']),
      ('bank_branches',    array['bank_id','banks']),
      ('batch_pages',      array['batch_id','batches']),
      ('batches',          array['created_by','user']),
      ('cases',            array['bank_branch_id','bank_branches','court_id','courts',
                                 'assigned_drafter','user','assigned_approver','user','created_by','user']),
      ('doc_jobs',         array['case_id','cases','created_by','user']),
      ('document_pages',   array['document_id','documents']),
      ('documents',        array['case_id','cases','uploaded_by','user']),
      ('draft_versions',   array['draft_id','drafts','created_by','user']),
      ('drafts',           array['case_id','cases','template_id','templates','created_by','user']),
      ('extracted_fields', array['case_id','cases','document_id','documents',
                                 'source_page_id','document_pages','verified_by','user']),
      ('filings',          array['case_id','cases']),
      ('loans',            array['case_id','cases']),
      ('mediations',       array['case_id','cases']),
      ('notices',          array['case_id','cases']),
      ('ocr_jobs',         array['document_id','documents','created_by','user']),
      ('parties',          array['case_id','cases']),
      ('tasks',            array['case_id','cases','assignee_id','user','created_by','user']),
      ('templates',        array['bank_id','banks']),
      ('usage_events',     array['case_id','cases']),
      ('user_roles',       array['user_id','user'])
    ) as s(tbl, args)
  loop
    execute format(
      'create trigger same_org before insert or update on public.%I
         for each row execute function public.enforce_same_org(%s)',
      spec.tbl,
      (select string_agg(quote_literal(a), ', ') from unnest(spec.args) a));
  end loop;
end $$;

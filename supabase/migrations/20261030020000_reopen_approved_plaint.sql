-- A plaint corrected or regenerated after approval needs a fresh approval: the case may move
-- back from approved to drafting (until it has gone to the notary). Mirrors
-- packages/domain/src/lifecycle.ts.
create or replace function public.case_transition_ok(f public.case_status, t public.case_status, needs_12a boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case f
    when 'bank_call'         then t in ('case_created')
    when 'case_created'      then t in ('docs_uploaded')
    when 'docs_uploaded'     then t in ('extraction_review')
    when 'extraction_review' then t in ('notice_generated', 'drafting')
    when 'notice_generated'  then t in ('notice_sent')
    when 'notice_sent'       then t = 'mediation_12a' or (t = 'drafting' and not coalesce(needs_12a, false))
    when 'mediation_12a'     then t in ('drafting')
    when 'drafting'          then t in ('in_approval')
    when 'in_approval'       then t in ('approved', 'drafting')
    when 'approved'          then t in ('notary_stamp', 'drafting')
    when 'notary_stamp'      then t in ('efiling_ready')
    when 'efiling_ready'     then t in ('filed')
    when 'filed'             then t in ('listed')
    when 'listed'            then t in ('disposed')
    else false
  end
$$;

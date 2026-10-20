-- Sec 12A: the plaint cites the date of the mediator's failure / non-starter report.
alter table public.mediations add column report_date date;
alter table public.mediations add constraint mediations_report_needs_outcome
  check (report_date is null or outcome in ('failed', 'non_starter', 'settled'));

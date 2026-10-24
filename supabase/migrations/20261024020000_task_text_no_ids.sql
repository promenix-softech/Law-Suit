-- Field tasks are now also written by the Android field app straight through the API, so the
-- "no identifiers in task text" rule (no PAN, no runs of 9+ digits: account, Aadhaar, phone)
-- moves from the web server action into the database.
alter table public.tasks
  add constraint tasks_note_no_ids check (
    note is null or (note !~* '\m[A-Z]{5}[0-9]{4}[A-Z]\M' and regexp_replace(note, '[\s-]', '', 'g') !~ '\d{9,}')),
  add constraint tasks_instructions_no_ids check (
    instructions is null
    or (instructions !~* '\m[A-Z]{5}[0-9]{4}[A-Z]\M' and regexp_replace(instructions, '[\s-]', '', 'g') !~ '\d{9,}'));

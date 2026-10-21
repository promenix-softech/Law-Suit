-- Prompt-injection tripwire results on bulk-intake pages (skill: prompt-injection-defense).
-- 'injection' = the page text reads like instructions to an AI; the admin sees a warning and
-- nothing derived from that page is applied without review.
alter table public.batch_pages
  add column flags text[] not null default '{}'
  check (flags <@ array['injection', 'hidden_text']::text[]);

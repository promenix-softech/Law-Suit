-- Which document an extracted value came from, so the reviewer can open it side by side.
alter table public.extracted_fields
  add column document_id uuid references public.documents (id) on delete set null;

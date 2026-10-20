---
name: docgen-pdfa-pipeline
description: How documents are generated — DOCX templating, LibreOffice headless to PDF/A-2b, Devanagari fonts, bookmarks, merging annexures, OCRmyPDF for scans. Use when working on templates, the worker's document jobs or golden-file tests.
---
# DOCX → PDF/A pipeline

1. **Template**: `packages/templates/{bank}/{court_type}/{doc_kind}.{lang}.docx` + `manifest.json` entry `{version, effective_from, legal_basis}`. Placeholders `{{field}}`; narrative blocks `{{#narrative.facts}}` filled from pseudonymised LLM output with real names substituted server-side.
2. **Render**: docxtemplater (Node) or docxtpl (Python). All amounts pre-formatted with `formatINR`.
3. **Convert**: `soffice --headless --convert-to 'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"2"}}' --outdir out in.docx` → PDF/A-2b.
4. **Fonts**: install Noto Serif Devanagari + Times New Roman (licensed) or Liberation Serif; verify embedded with `pdffonts`. Check conjuncts (क्ष, त्र, ज्ञ, श्र) render — golden test.
5. **Scans**: `ocrmypdf --output-type pdfa-2 --image-dpi 300 -l eng+mar in.pdf out.pdf`.
6. **Merge + bookmarks**: pikepdf/qpdf; one top-level bookmark per document and annexure.
7. **Validate**: veraPDF (PDF/A), no encryption, A4 page size, file name via `efilingFileName`.
8. **Golden test**: render synthetic case → `pdftotext` → compare to `__golden__/*.txt`.

Run the worker in Docker; jobs come from pgmq; long jobs must not run on Vercel serverless.

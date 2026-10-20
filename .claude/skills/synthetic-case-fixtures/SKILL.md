---
name: synthetic-case-fixtures
description: Rules and shape for fake borrowers, loans and scans used in tests, seeds and demos. Use whenever creating fixtures, seed data, screenshots or demo cases.
---
# Synthetic case fixtures

- Never use real client files. Real samples (after NDA) stay outside the repo (`/data`, git-ignored) and never enter prompts.
- Names: obviously fictional ("Ramesh Demo Patil", "Sunita Test Kulkarni").
- PAN: `FAKE` + 1 letter + 4 digits + 1 letter (e.g. `FAKEP1234Z`). Aadhaar: `XXXX-XXXX-` + 4 digits. Account no.: `DEMO` + digits. The `pii-scan` hook enforces this.
- Banks: use real bank names only as masters (SBI, UBI, PNB, BoM) — fake branches/IFSC like `SBIN0DEMO01`.
- Amounts in paise; cover thresholds: < ₹1L, exactly ₹3L (commercial), ₹10–11L (slab change), ≥ ₹20L (DRT).
- Scanned-look PDFs: render the fixture to PDF, rasterise at 300 DPI with slight rotation/noise, so the OCR path is exercised.

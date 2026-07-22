# documents/ — generate and wrangle real documents

When the deliverable is a **file a human opens** — a PDF report, a Word doc, an Excel model, a deck — not
code. SKULL reaches for the right library per format and keeps the output correct, styled, and accessible.
(Gap harvested from the public archive, where document skills are among the most-used: we learned the
*approach* from the best, incl. Anthropic's official skills, and re-implemented it over open libraries — see
`docs/ECOSYSTEM.md`.)

**Current members**
- `doc-pdf` — create, fill, and extract PDFs: HTML→PDF for styled reports, form-filling, merge/split, and
  text/table extraction. Picks the right engine (WeasyPrint / headless Chromium / ReportLab / pypdf /
  pdfplumber / PyMuPDF).
- `doc-office` — Word / Excel / PowerPoint: python-docx & docxtpl (templated letters/reports), openpyxl &
  XlsxWriter (spreadsheets with real formulas, formatting, charts), python-pptx (decks from data).

**Brainstorm — what else belongs here** (good first contributions)
- `doc-markdown` — Obsidian / GitHub-flavored markdown authoring and conversion (pandoc).
- `doc-csv-data` — clean, validate, and reshape tabular data before it becomes a report.
- `doc-diagram` — mermaid / Graphviz / draw.io as code.

**Add one:** create `skills/documents/<your-skill>/SKILL.md`. See [CONTRIBUTING](../../CONTRIBUTING.md).

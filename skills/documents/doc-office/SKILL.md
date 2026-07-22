---
name: doc-office
description: >-
  Generate and edit Microsoft Office files — Word, Excel, PowerPoint — when the deliverable is a document,
  not code. Triggers on "make a Word doc", "generate an Excel report", "build a spreadsheet with formulas or
  charts", "create a deck or slides", "fill a docx template". Reaches for python-docx and docxtpl (templated
  documents), openpyxl and XlsxWriter (spreadsheets with real formulas, styling, charts), and python-pptx
  (slides from data). Prefers templating over hand-building; keeps numbers as live formulas, not strings.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# doc-office — Word, Excel, PowerPoint

The deliverable is a `.docx`, `.xlsx`, or `.pptx`. Reach for the right library; **prefer templating over
hand-building** a document element by element.

## Word
- **Templated** (same shape each time — a letter, a report) → **docxtpl**: Jinja2 inside a real .docx
  template the user designed in Word. Styling stays in the template, data in code.
- **From scratch** → **python-docx**: headings, tables, images. Keep to **named styles**, don't hand-format
  every run.

## Excel
- **openpyxl** — read+write: formulas, styles, conditional formatting, charts, named ranges.
- **XlsxWriter** — write-only, but richer formatting/charts and faster on big sheets (`constant_memory` mode).
- **pandas** `to_excel` for a quick data dump; drop to openpyxl/XlsxWriter for formatting and formulas.
- **Keep numbers as real formulas** (`=SUM(...)`), not pre-computed strings — the user expects a live model.
  Set column widths, freeze the header row, format currency/dates, add a total row.

## PowerPoint
- **python-pptx** — slides from data: pick a layout, fill placeholders, add tables/charts/images. Reuse a
  branded template (`Presentation("template.pptx")`) instead of the default theme.

## Quality gate
- **Open the file in the real app** (or LibreOffice headless) — valid-looking OOXML a viewer rejects is not "done".
- Named styles + a template beat inline formatting for anything the user will maintain.

## Pitfalls
- python-docx can't "update" a table of contents — Word rebuilds it on open (tell the user to press F9).
- openpyxl silently drops charts/macros it doesn't understand on round-trip — don't blindly read+write a
  macro workbook (`.xlsm`); use the right tool or keep a copy.
- Merged cells + formulas fight — set the value on the top-left cell only.

---
*Learned from the community's document skills (incl. Anthropic's official DOCX/XLSX/PPTX skills) —
re-implemented as guidance over open libraries, not vendored. See `docs/ECOSYSTEM.md`. Pairs with `doc-pdf`.*

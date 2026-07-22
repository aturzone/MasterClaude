---
name: doc-pdf
description: >-
  Create, fill, and extract PDFs — when the deliverable is a PDF, not code. Triggers on "generate a PDF",
  "make a report or invoice PDF", "fill this PDF form", "extract text or tables from a PDF", "HTML to PDF".
  Picks the right engine: WeasyPrint or headless Chromium for styled HTML-to-PDF reports, ReportLab for
  programmatic layout, pypdf for form-filling and merge/split, pdfplumber or PyMuPDF for text/table
  extraction. Keeps output selectable, styled, and accessible — never a page of rasterized text.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# doc-pdf — create, fill, and extract PDFs

The deliverable is a PDF a human opens. **Pick the engine by the job** — don't force one library to do all three.

## Choose the approach
- **Styled report / invoice / letter (HTML you control)** → render HTML+CSS to PDF.
  - **WeasyPrint** (pip) — best for print CSS (`@page`, page numbers, running headers/footers); pure-Python,
    no browser. The default for tabular reports.
  - **Headless Chromium** (Playwright/Puppeteer `page.pdf()`) — when the layout already renders in a browser
    or needs web fonts / JS / exact flexbox. Set print media (`emulateMedia('print')`), else screen CSS leaks in.
- **Programmatic layout (precise coordinates, tables, charts)** → **ReportLab** (platypus flowables), or
  **fpdf2** for simple cases.
- **Fill an existing form** → **pypdf** (read fields, set values, optionally flatten) or **pdf-lib** (JS).
  Keep the AcroForm unless the user wants it flattened.
- **Merge / split / rotate / stamp** → **pypdf**.
- **Extract text or tables** → **pdfplumber** (layout-aware tables) or **PyMuPDF / fitz** (fast text, images,
  coordinates). Scanned PDF? OCR first (**ocrmypdf** / Tesseract).

## Recipes (sketch — adapt to the repo's language)
- **HTML→PDF:** build HTML from a Jinja2 template + one print stylesheet, then `weasyprint in.html out.pdf`.
- **Data→table PDF:** ReportLab `Table` + `TableStyle`; repeat header rows; right-align numbers; page breaks.
- **Form fill:** load with pypdf, map field→value from data, write; flatten only if no further editing is needed.

## Quality gate
- **Text stays selectable** — never ship rasterized text unless it's genuinely a scan.
- **Embed fonts**; set page size (A4/Letter) and margins; **tag for accessibility** (structure, alt text)
  when it matters.
- **Verify it opens** in a real viewer — that the bytes wrote is not proof it renders.

## Pitfalls
- Chromium `page.pdf()` uses *screen* media by default — force print media or your `@page` rules vanish.
- **Redaction:** drawing a black box does **not** remove the text underneath. Use PyMuPDF to actually delete
  the content (and redact PII with `sec-pii` before the data ever leaves the box).

---
*Learned from the community's document skills (incl. Anthropic's official PDF skill) — re-implemented as
guidance over open libraries, not vendored. See `docs/ECOSYSTEM.md`. Pairs with `doc-office` and `sec-pii`.*

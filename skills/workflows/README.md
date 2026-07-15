# workflows/ — big, multi-step jobs

Skills here drive a long procedure end to end, in passes, instead of a single shot.

**Current members**
- `wf-codebase-audit` — a rigorous, line-by-line, whole-repo audit with a prioritized fix plan and an
  honest coverage statement.
- `wf-security-audit` — a full front→back security audit mapped to the OWASP Top 10 + CWE, with a
  coverage statement.
- `wf-ui-uplift` — a full design pass: brief → system → layout → build → an accessibility-first review →
  `mc.html`, with a coverage ledger.

**Brainstorm — what else belongs here** (great first contributions)
- `dependency-upgrade-sweep` — upgrade deps in safe batches, run tests, write the changelog.
- `test-backfill` — find untested critical paths and add tests pass by pass.
- `i18n-extraction` — pull hardcoded strings into a translation catalog.
- `monorepo-split` / `package-extraction` — carve a module out into its own package.
- **Stack-flavored variants:** `react-class-to-hooks`, `js-to-ts-migration`, `python2-to-3-sweep`.

**Add one:** create `skills/workflows/<your-skill>/SKILL.md`. See [CONTRIBUTING](../../CONTRIBUTING.md).

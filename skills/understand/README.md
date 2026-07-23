# understand/ — explain, debug, and trace the history of code

Skills here help you (and Claude) actually understand a codebase instead of guessing.

**Current members**
- `cap-explain-senior` — explanations at staff-engineer altitude: the model, the gotchas, when *not* to use it.
- `cap-rubber-duck` — a disciplined debugging partner that makes you find the root cause.
- `codehistorian` — git archaeology: why is this code the way it is, and what regressed.
- `repo-map` — a ranked, token-budgeted map of the codebase, so you open 3 files instead of 30.
- `codescribe` — capture the *why* after a change (hidden constraints, decisions, edge-case guards) into `.skull/context/` so the next session starts with the knowledge, not without it. The write-side companion to `codehistorian`.

**Brainstorm — what else belongs here** (great first contributions)
- `onboarding-tour` — walk a newcomer through the repo's entry points and data flow.
- `stacktrace-triage` — turn a stack trace into the likely cause + the file to open first.
- `dependency-explainer` — explain what a dependency does and why it's here.
- `flame-graph-reader` — read a profile and name the hotspot.
- **Stack-flavored variants:** `react-rerender-explainer`, `go-goroutine-tracer`,
  `python-import-untangler`, `webpack-bundle-explainer`.

**Add one:** create `skills/understand/<your-skill>/SKILL.md`. See [CONTRIBUTING](../../CONTRIBUTING.md).

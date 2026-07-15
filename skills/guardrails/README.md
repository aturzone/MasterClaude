# guardrails/ — keep the work honest and the codebase healthy

The Guardian suite: disciplines that keep an agent from cutting corners, and analysis that keeps the
codebase in good shape.

**Current members**
- `guardian` — verify before "done"; tests are sacred; stay in scope.
- `supplyguard` — check a dependency exists, isn't vulnerable, and isn't a typosquat — before writing it down.
- `testmedic` — detects flaky tests and root-causes the non-determinism (without weakening them).
- `cap-tdd` — strict red-green-refactor as a discipline, with the excuses table and "delete means delete".
- `debtradar` — ranks refactor targets by churn × complexity, so you fix what actually hurts.
- `compactor` — context-compaction safety for long sessions (snapshot/restore, timing nudges).
- `guardian-suite` — the switchboard: which guardrails are standing, recorded in `.claude/master-claude.json`.

> **These are disciplines, not interception.** They are Markdown the model reads and follows — nothing here can
> block a tool call. A rule that must hold *every* time belongs in a `PreToolUse` hook or a `permissions.deny`
> rule, installed deliberately by the developer. We say so plainly, because a guardrail you trust more than it
> deserves is worse than no guardrail at all.

**Brainstorm — what else belongs here** (great first contributions)
- `secret-scanner` — block commits that add API keys / tokens / `.env` values.
- `license-checker` — flag a new dependency with an incompatible license.
- `coverage-gatekeeper` — refuse a "done" if coverage on touched lines dropped.
- `bundle-size-watcher` — warn when a change inflates the production bundle.
- **Stack-flavored gates:** `go-vet-gate`, `eslint-gate`, `mypy-gate`, `ruff-gate`, `clippy-gate`.

**Add one:** create `skills/guardrails/<your-skill>/SKILL.md`. See [CONTRIBUTING](../../CONTRIBUTING.md).

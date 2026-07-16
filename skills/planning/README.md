# planning/ — turn a fuzzy ask into a spec & plan, before any code

Skills here pin down *what* to build and *how* to approach it, so you don't build the wrong thing fast.

**Current members**
- `grill-me` — interrogate a vague request into a precise spec.
- `cap-brainstorm` — diverge wide across genuinely different options, then converge on a recommendation.
- `cap-plan-first` — refuse to code until there's a tight plan with a scope guard.
- `cap-spec-smith` — turn a fuzzy idea into a one-page spec (goals, non-goals, acceptance criteria).
- `cap-decomposer` — split work into the smallest verifiable steps and flag the critical path.
- `cap-write-plan` — spec + decomposition → a plan a fresh subagent can execute cold.
- `cap-execute-plan` — drive an approved plan to done, one verified step at a time.
- `adr` — record a hard-to-reverse decision (Context / Decision / Consequences / Status) so the reasoning outlives the choice.

**Brainstorm — what else belongs here** (great first contributions)
- `estimate-effort` — size a task (S/M/L + risks) before committing.
- `api-contract-first` — design the interface/schema before the implementation.
- `migration-planner` — plan a risky schema/data migration with a rollback.
- **Stack-flavored variants** (the multi-stack vision): `react-component-spec`, `go-package-layout`,
  `python-package-scaffold`, `rest-vs-graphql-chooser`, `db-schema-planner`.

**Add one:** create `skills/planning/<your-skill>/SKILL.md` (frontmatter `name` + a trigger-focused
`description`, then the methodology as instructions). See the repo [CONTRIBUTING](../../CONTRIBUTING.md).

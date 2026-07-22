# testing/ — the Tester team

SKULL's QA team. Point it at any project and it stands up a **per‑project test workspace**,
then runs every kind of test — the way a real user experiences the app, from the outside as a black
box, down in the code, and under load — and writes a single charted status dashboard (`skull.html`) at
the project root. It is **safe by default**: read‑only toward your source, no autonomous runners.

The team is driven by the bundled, dependency‑isolated **QA engine** at
[`engine/`](engine/) (a git‑native runner: one test = one JSON file; three executor lanes —
Playwright scripts, headless‑Claude agents, and guided human interviews; results merge into one
CTRF report). Install it once per machine: `cd .claude/skills/testing/engine && pnpm install`.

## Current members

- **`wf-tester`** — the driver. Maps the project, scaffolds/confirms the QA workspace, runs the four
  passes, and generates `skull.html`. Start here (or say "test everything" / run `/skull:test`).
- **`test-user-end`** — real end‑user flows (clicks, forms, i18n/RTL, offline) via the agent + human lanes.
- **`test-blackbox`** — outside‑in checks with no source hooks: functional, visual, a11y, perf, SEO, PWA, network/console.
- **`test-code`** — code‑level tests: unit/integration coverage and TDD discipline (reuses `cap-tdd`, `testmedic`, `wf-codebase-audit`).
- **`test-stress`** — load & soak testing (k6) to find where the app bends under pressure.
- **`skull-dashboard`** — renders `skull.html`: a CLI‑styled, professional, charted view of SKULL's team and its findings for this project.
- Agent: **`tester`** (`agents/testing/tester.md`) — read‑only toward source; drives the engine, writes results under `.skull/qa/` + the root `skull.html`.

## Brainstorm — what else belongs here

`test-api` (contract/schema + fuzzing) · `test-a11y` (a dedicated WCAG pass) · `test-visual` (baseline diffing) ·
`test-mobile` (device matrices) · `test-data` (migration/seed sanity) · `flake-triage` (a thin wrapper over `testmedic`).

## Add one

Drop a `SKILL.md` in `skills/testing/<name>/` with trigger‑focused frontmatter, add a matching
`catalog/<name>/` to the website, and follow `docs/ADDING-A-CAPABILITY.md`. Generic skills should
detect the stack themselves; the QA engine is already target‑agnostic (scaffold a new target with
`pnpm qa scaffold-service <name> --url <baseURL>`).

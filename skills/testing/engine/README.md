# SKULL QA — Git-Native Black-Box End-User QA Engine

A git-native QA monorepo for testing web apps the way a real end user experiences them: UI/UX,
clickability, forms, navigation, visual regressions, performance, accessibility,
security-observational checks, SEO, PWA behavior, network/console health, resilience, and content.
It never touches application source or product test hooks — every task drives the deployed app
from the outside, the way a browser and a person would.

Every test task is one JSON file. Executors are **scripts** (Playwright), **AI agents** (Claude
via Playwright MCP), and **humans** (guided structured interviews, including attended-live
sessions). Results from all three lanes merge into one CTRF report.

## Quick start

```powershell
# one-time setup (Windows)
powershell -File tools/scripts/bootstrap.ps1

pnpm install
pnpm exec playwright install chromium

# scaffold a new project (creates apps/<name>/ from the template)
pnpm qa scaffold-service example --url https://example.com

# validate all task files
pnpm qa validate --service example

# run the public smoke suite (class-a tasks only: public, no auth, no state change)
pnpm qa run --service example --env production --section s01-smoke
```

## Layout

| Path | What |
|---|---|
| `apps/<service>/` | One project under test (website, app shell, blog, PWA, …): tasks, checklist, selector memory, baselines, env profiles |
| `packages/` | Shared `@mc-qa/*` libraries (runner, fixtures, assertions, reporting, …) |
| `tools/` | Docker, service template, vendored assets, Windows scripts |
| `docs/` | Workflows, taxonomy, testing standards, risk & safety |
| `results/` | Per-run artifacts (git-ignored) |

## The rules that matter

1. **Risk classes** `a`–`d` on every task; class `d` (irreversible / real-world side effect) is
   structurally impossible to run unattended. See [docs/risk-and-safety.md](docs/risk-and-safety.md).
2. **One task = one JSON file** under `apps/<svc>/tasks/`, ID embeds the taxonomy path.
   See [docs/adding-a-task.md](docs/adding-a-task.md).
3. Visual baselines are rendered in **Docker only** (font determinism).
4. Agents **propose** selectors; humans merge them. `authored` entries are never auto-modified.
5. **English-first & neutral by default**: locale `en-US`, timezone `UTC`, latin digits, viewport
   1280x800. i18n/RTL assertion helpers are available but opt-in per project.

Read [docs/workflows.md](docs/workflows.md) first.

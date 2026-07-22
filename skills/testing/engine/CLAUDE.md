# CLAUDE.md — SKULL QA workspace guide

Read this first. It orients a Claude session in this repo. Deep detail lives in `docs/`.

## What this is
**SKULL QA** — a git-native, black-box, **end-user** QA monorepo for testing web apps.
Everything is tested the way a real user experiences it (UI/UX, clickability, forms, navigation,
console/network/WebSocket health, performance, PWA install/offline, accessibility, visual, SEO,
security-observational checks, resilience, content). No application source, no product test hooks.
Three equal executor lanes — **scripts** (Playwright), **AI agents** (Claude via Playwright MCP),
**humans** (guided interviews, including attended-live sessions) — merge into one CTRF report per
run.

Each deployed surface under test is a **service**: a folder under `apps/<name>/`, created with
`pnpm qa scaffold-service <name> --url <baseURL>`. The immutable `service.config.ts#id` is what
task ids, status, and env vars key on; `--service` accepts either the folder name or the config
id, and defaults to the sole service when only one exists. A workspace can hold one service or
many — scaffold a new one whenever another project needs coverage.

## Note: canvas-rendered UIs
Not every app is a normal DOM app. If a project under test renders to a `<canvas>` instead of the
DOM (Flutter Web/CanvasKit, a WebGL/Unity surface, a canvas-based editor), standard DOM assertions
silently no-op: `document.body.innerText` is empty, `document.fonts` may be empty, and CSS-based
selectors find nothing. For those apps, assert via the **accessibility/semantics tree**
(`getByRole`), network/resource signals, screenshots, or agent judgment instead — see
`docs/testing-standards.md`. Ordinary HTML apps aren't affected; `@mc-qa/assertions` applies to
them directly.

## Commands (always from repo root)
```
pnpm qa validate --service example                  # schema + id/path + selector-key + checklist lint
pnpm qa coverage --service example                   # taxonomy categories with no active task (gap radar)
pnpm qa login    --service example --env staging      # capture + persist an authenticated session
pnpm qa session  start/status/stop --service example  # manage a reusable dev session (headed browser)
pnpm qa run      --service example --env production [--section sNN-x] [--tags t1,t2] [--risk a,b] [--executor script|agent|human] [--task <id>] [--authenticated] [--headed] [--interactive] [--supervised] [--docker] [--agents]
pnpm qa agent-run --run <runId> [--task <id>] [--concurrency N] [--budget X]  # drive briefed agent tasks (headless Claude + Playwright MCP)
pnpm qa ingest    --service example --run <runId>     # fold agent/human results back in
pnpm qa interview --service example --run <runId>     # walk queued human interviews
pnpm qa checklist --service example                   # curated task order + release-gate section status
pnpm qa dashboard --service example                   # static coverage/health dashboard
pnpm qa verify-selectors --service example            # nightly selector re-resolution + stability
pnpm qa task new    --service example --category <cat> --slug <slug>
pnpm qa finding new --service example --slug <slug> [--task <id>] [--run <runId>]
pnpm qa scaffold-service <name> --url <baseURL>
```
Single-task dev loop: `QA_TASK=<id> pnpm --filter @mc-qa-app/example exec playwright test --headed`.
See `docs/workflows.md` for the full flag reference.

## Layout
- `packages/` — shared `@mc-qa/*` libraries:
  - `core` — types, JSON schemas (task schema, env-profile schema), the task loader, validator,
    risk gate, i18n, progress reporting.
  - `assertions` — optional i18n/RTL/bidi assertion helpers, enabled per project (nothing
    defaults to a non-English locale).
  - `fixtures` — Playwright fixtures: console/network/WebSocket captures, web-vitals, the human
    prompt, the risk guard.
  - `selector-memory` — learned/authored selector maps.
  - `agent-bridge` — drives headless Claude Code + Playwright MCP agents, ingests their results,
    Session Keeper attach.
  - `reporting` — CTRF merge, release verdict, run-report HTML/MD, dashboard.
  - `runner` — the `pnpm qa` CLI, plan builder, the parametrized Playwright suite, login,
    interviews, scaffolding.
- `apps/<service>/` — `tasks/**/*.task.json` (the test cases), `checklist.json` (curated order),
  `envs/`, `selector-memory/`, `aria-snapshots/`, `baselines/`, `status/` (committed verdicts),
  `data/`, `findings/`, `agent-context.md`, `specs/steps/` (custom step functions for that
  service).
- `tools/` — Docker (image + compose), scripts (bootstrap/nightly), service template, vendor.
- `docs/` — start at `workflows.md`; then risk-and-safety, testing-standards, taxonomy,
  adding-a-task, adding-a-service.

## Non-negotiable rules
1. **Risk safety (`docs/risk-and-safety.md`)**: every task has `risk.class` a–d.
   - `a` — public, no auth, no state change.
   - `b` — authenticated, read-only or reversible.
   - `c` — state-mutating but test-scoped / reversible (create-then-delete a record, toggle a
     setting).
   - `d` — irreversible / real-world side effect (a payment, a permanent delete, sending a
     message, publishing). Structurally impossible to run unattended: the planner gate
     (`risk-gate.ts`) refuses out-of-policy tasks into `plan.json` (visible in
     `plan.json.refused`), the `riskGuard` fixture re-checks `QA_ALLOWED_RISK` inside every test,
     and the agent action-guard hook blocks money/irreversible/security/credential/PII actions.
     Class `d` only ever runs via `--supervised` plus a typed `CONFIRM <taskId>` per task, and
     never in CI. Agent tasks are capped at risk `b`. Never weaken this — it's defense in depth
     across three independent layers, not one check.
2. **Never allowlist a first-party console/network error** to make a test pass. Quarantine the
   task (`status: quarantined` + `quarantinedUntil` ≤ 30 days) and file a finding. Allowlists in
   `service.config.ts` are for third-party noise only.
3. **Visual baselines are Docker/Linux only** (font determinism). `screenshotCompare` self-skips
   on the Windows host unless `--allow-host-visual`.
4. **One task = one JSON file**; ID embeds the taxonomy path and is immutable. Every active task
   sits in exactly one checklist section (or `unscheduled` with a reason) — the validator enforces
   it.
5. **Agents propose, humans merge**: agent-learned selectors land as `provenance:"learned",
   state:"candidate"` via `qa ingest`; `authored` entries are never auto-modified.
6. **English-first & neutral by default**: locale `en-US`, timezone `UTC`, latin digits, viewport
   1280x800. i18n/RTL assertion helpers in `@mc-qa/assertions` are opt-in per project.

## Release gate
`checklist.json` sections marked `gate: true` are load-bearing: a failed task in a gate section
fails the run (exit 1). Non-gate failures are surfaced but don't block. The goal state: the whole
gated checklist green against `production` ⇒ safe to ship to real users.

## Agents & Claude-in-Chrome
Agent tasks emit a self-contained `results/<run>/agent/<taskId>/brief.md` + `mcp.json`. Two ways
to drive them:
- **Autonomous (default for a full run):** `pnpm qa agent-run --run <runId>` (or `pnpm qa run …
  --agents`) drives every briefed task through a **headless `claude -p`** session with Playwright
  MCP — bounded by `--concurrency` (3), `--per-task-budget` ($3) and `--budget` ($50). Three
  safety layers sit under the brief: a **tool allowlist** (no `browser_evaluate`/route/storage/
  cookie/upload), **hardened MCP flags** (`--headless --isolated`, per-action timeouts), and a
  **PreToolUse action-guard hook** (`tools/agent-guard/guard.mjs`) that blocks clicks/typing on
  money/irreversible/security/credential/PII controls. Secrets are scrubbed from the agent's env;
  it writes only under its own task dir. Code lives in `@mc-qa/agent-bridge` (`driver.ts`,
  `agent-settings.ts`, `prompts/qa-agent-system.md`).
- **Attended:** `claude --mcp-config <mcp.json>` (Playwright MCP) or the **Claude-in-Chrome**
  extension (`mcp__claude-in-chrome__*`) for on-site exploration.

Then `pnpm qa ingest` (or the driver itself) folds `result.ctrf.json` + learned selectors back in.
The brief's SAFETY RULES + the service `agent-context.md` bound what the agent may do; agent tasks
are capped at risk `b`. If the bundled Playwright browser can't be installed in your environment,
point the driver at a system browser channel instead via `--browser` (or `MC_QA_AGENT_BROWSER`).

**Authenticated session:** `qa login` captures and persists an authenticated session
(`storageState`, including IndexedDB for apps that keep auth state there — a plain cookies/
localStorage snapshot alone would load logged-out for those). Before an `--agents`/`agent-run`, a
`session-preflight` checks the saved session hasn't been bounced back to a login screen; if it
has, auth-preconditioned agent tasks are marked `blocked-no-session` (no spend). Logged-out
script tasks always run in a fresh empty-`storageState` context.

## Reports, evidence & human interviews
After a run, results merge into a run-scoped **CTRF** report plus a human-readable report
(`packages/reporting` builds `report.md`/`report.html`), and `pnpm qa dashboard` renders a static
coverage/health view. Every report opens with a two-state headline — **failed tasks** (reason +
video) and **passed tasks** (video) — an at-a-glance split built from the run's merged CTRF.

**The video is the proof** a flow was actually exercised: every agent task records a `.webm`
(isolated lane via Playwright's `recordVideo`; CDP-attach lane via the MCP DevTools screencast). A
passed **authenticated** task that produced no video is flagged `noVideo` and shown as
**unverified** with a re-run prompt — a green row can never silently mean "no evidence."

**Evidence is organized and de-duplicated** into `results/<runId>/evidence/videos/<taskId>.webm`
and `evidence/documents/<taskId>/…` (hard-linked from the raw `agent/` + `human/` result dirs, so
there's no duplication and the originals stay the source of truth). Any capture that contains real
personal data stays **disk-only** — present under `evidence/` but excluded from anything shared
externally.

Queued **human** tasks — things only a person can judge — are claimable interview cards: a tester
picks one, works through the generated `humanInterview` questions (taps/typed answers/photo
evidence), and `pnpm qa interview` writes `human/<taskId>/result.json` with a masked tester
identity; `pnpm qa ingest` folds the verdict back in. Interview evidence (photos, contact details)
is PII: it stays local to the run directory, and reports link the paths while masking identifying
fields.

**Attended-live human tasks:** a task with a `humanInterview.live` block runs live instead of as a
blind questionnaire — a headed browser opens on the host machine, video-recorded, while the
tester works through the same questions in real time. Every attended result is `pending-review`
until a **different** reviewer approves it (self-review is blocked). Class-`c` tasks
(state-mutating but reversible — e.g. a settings change exercised end-to-end, or a
create-then-delete record) can be admitted as **inspect-only** attended interviews: they leave no
lasting state, and any capture showing sensitive account details stays disk-only.

## Environment
Windows 11 + PowerShell (primary) / Bash tool for POSIX. Node 24, pnpm. Docker Desktop (WSL2)
needed only for the visual + security-sidecar lanes. Secrets live in a git-ignored `.env`
(`MC_QA_<SVC>_<ENV>_<KEY>`); `.env.example` documents the names.

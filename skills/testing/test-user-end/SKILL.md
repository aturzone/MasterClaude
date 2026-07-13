---
name: test-user-end
description: >-
  Test a project the way a real end user experiences it — click-through journeys, forms and
  validation, empty/error/loading states, i18n/RTL, keyboard, offline/PWA — using the QA engine's
  agent and human lanes. Triggers on "test the user flows", "does the UI actually work", "end-user
  testing", "test signup/checkout/onboarding as a user". Not for code-level unit tests (use test-code).
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# test-user-end — the app through a real user's eyes

Verify the product *works for a human*, from the outside, with no source hooks. Part of the `wf-tester`
team. Drive it through the bundled engine's **agent lane** (a headless Claude driving a real browser
via Playwright MCP, with judgment) and **human lane** (guided interview cards for things only a person
can judge — "did this feel broken?").

## What to cover
- **Core journeys** — the 3–5 flows that define the product (sign up, log in, the primary task,
  checkout/submit, settings). Each is one task file; the id embeds the taxonomy path.
- **Input & validation** — good/bad/empty input, boundary values, error messages that a human can act on.
- **States most UIs forget** — empty, loading, error, offline, slow network, no-results.
- **Accessibility of the flow** — keyboard-only path, focus order, visible focus, announced errors.
- **i18n / RTL** — if the app is localized, run the optional i18n assertions; check layout doesn't break RTL/LTR.
- **Trust & judgment** — "does anything look broken, off, or scammy?" — the agent's `ux-judgment` verdict + a human spot-check.

## How
1. Scaffold or reuse the target: `cd .claude/skills/testing/engine && pnpm qa scaffold-service <name> --url <baseURL>`.
2. Author user-journey tasks (`pnpm qa task new --service <name> --category func --slug <slug>`), or let the agent propose them.
3. Run the agent lane, cost-capped: `pnpm qa run --service <name> --agents --concurrency 3 --per-task-budget 3 --budget 30`.
4. Queue human interviews for the judgment calls; walk them with `pnpm qa interview`.
5. **Every passing journey needs evidence** (a recording). A green task with no recording is reported as *unverified* — re-run it for proof.

## Safety
Agent tasks are capped at low risk; a PreToolUse guard blocks clicks/typing on money/OTP/PII controls,
and irreversible/real-money steps are refused unattended. No `--dangerously`. Secrets stay in a
gitignored `.env`; recordings that show personal data are kept disk-only, never shipped.

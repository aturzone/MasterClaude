---
name: test-code
description: >-
  Test at the code level — unit and integration tests, coverage of the critical paths, and
  test-first (TDD) discipline for new work — reusing the project's own test runner. Triggers on "add
  tests", "increase coverage", "unit/integration tests", "TDD", "the code has no tests", "test this
  function/module". Not for outside-in UI checks (use test-blackbox) or load (use test-stress).
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# test-code — coverage where it counts

Add and run code-level tests with the project's **own** runner (Jest/Vitest/pytest/go test/…). Part of
the `wf-tester` team. This pass doesn't need the QA engine — it works in the repo, so it composes the
existing MASTER CLAUDE guardrails rather than reinventing them.

## Reuse, don't reinvent
- **`cap-tdd`** — for any new behavior: red (failing test) → green (make it pass) → refactor. Never weaken a test to go green.
- **`testmedic`** — when the suite is flaky: detect via reruns, quarantine honestly, root-cause the non-determinism.
- **`wf-codebase-audit`** — surfaces `TEST` findings (untested critical paths, wrong tests) across the repo.
- **`guardian`** — the honesty gate: blocks skipped/weakened tests and false "done" claims.

## What to cover
1. **Detect the stack + runner** — read the manifest and existing tests; use the same framework and conventions.
2. **Critical paths first** — the code that would hurt most if it broke: money/auth/data-write/permission checks, core domain logic, error handling.
3. **Edge cases** — boundaries, empty/null, failure injection, concurrency where it applies.
4. **Coverage as a signal, not a target** — chase the untested *risky* lines, not a percentage. Report the gaps you deliberately left.

## How
- Run the existing suite first (`npm test` / `pytest` / `go test ./...`) and record the baseline.
- Add tests pass by pass; keep each test independent and deterministic.
- Feed results into the run so they show up in `mc.html` alongside the other lanes (write a small
  CTRF or a summary the `mc-dashboard` skill can read from `.mc/qa/`).

## Output
Tracked findings for untested critical paths, a short coverage-gap note, and green new tests — never a
green suite bought by deleting assertions.

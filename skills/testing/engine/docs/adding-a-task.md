# Adding a task

A task is **one JSON file** under `apps/<service>/tasks/<category-path>/<slug>.<NNN>.task.json`.
The file *is* the test case — there is no separate TCMS.

## 1. Scaffold

```powershell
pnpm qa task new --service example --category smoke --slug page-loads --owner you@example.com
```

This creates the next free `NNN` in the right folder with a `draft` template and the correct
`$schema` pointer (editor IntelliSense + CI both validate against
`packages/core/src/schemas/task.schema.json`).

## 2. The ID convention (immutable)

`<service>.<taxonomy-category>.<slug>.<NNN>` — e.g. `example.smoke.page-loads.001`.
The category **must** exist in `packages/core/src/schemas/taxonomy.json` and match the id's
middle segments and the folder path. IDs never change — a rename is a new ID plus the old task
set to `deprecated` with `supersededBy`. Stable IDs are what make status history and
`qa coverage` work.

## 3. Fill the blocks (be explicit — richer is better)

- **`goal`** — what user-visible behavior this protects and *why*.
- **`classification`** — `category`, `testTypes[]`, `tags[]`.
- **`importance`** — `priority` P0–P3, `severityIfBroken`, `businessImpact`.
- **`risk`** — `class` a–d, `allowedEnvs[]`, `forbiddenActions[]`. When unsure between `b` and
  `c`, choose the more conservative one.
- **`automation`** — `level`, `executor` (`script`|`agent`|`human`|`hybrid`),
  `humanInvolvement` 0–5. Agent tasks need an `agentBrief`; `humanInvolvement >= 3` needs a
  `humanInterview`.
- **`procedure`** — `preconditions[]`, `steps[]` (step DSL or `custom` fn), `selectorKeys[]`.
- **`oracle`** — `expected[]`, `evidence.required[]`, `baselines`.
- **`lifecycle`** / **`schedule`** — status, owner, dates, sources, frequency, durations.

## 4. The step DSL

Script steps use verbs interpreted by `packages/runner/src/playwright/define-task-suite.ts`:
`goto`, `click`, `fill`, `press`, `expectVisible`, `expectHidden`, `expectText`, `expectUrl`,
`assertDocumentRTL`, `assertNoHorizontalOverflow`, `assertFontLoaded`, `assertNoTofu`,
`assertNoConsoleErrors`, `assertNoFailedRequests`, `expectWsActive`, `screenshotCompare`,
`axeScan`, `setOffline`, `custom`.

Anything more complex is a `{"action":"custom","fn":"myStep"}` registered in the service's
`specs/steps/` — **tasks stay data, code stays code**. (If the surface renders to a canvas — e.g.
a Flutter Web app — remember DOM assertions won't see its content; see
`docs/testing-standards.md`.)

## 5. Validate, place, dry-run

```powershell
pnpm qa validate --service example            # schema + id/path/category + selector-key cross-check
```

Add the ID to exactly one section of `apps/<svc>/checklist.json` (or to `unscheduled[]` with a
reason) — the validator fails otherwise. Then a single-task dry run:

```powershell
$env:QA_TASK="example.smoke.page-loads.001"
pnpm --filter @mc-qa-app/example exec playwright test --headed
```

(The `riskGuard` fixture still enforces the gate even in this direct mode.)

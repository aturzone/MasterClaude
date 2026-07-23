---
name: test-frontend
description: >-
  Test frontend UI code the way it should be tested — risk-scored per file (P0–P3),
  behavior-not-implementation, boundary-only mocking, and the minimum valuable set.
  Covers components, composables/hooks, stores, forms, and SSR/hydration safety using
  the project's own runner (Vitest/Jest + Testing Library / Vue Test Utils, Playwright
  for E2E). Triggers on "test this component/page", "frontend/Vue/React/Nuxt tests",
  "component/composable/store tests", "why is this test flaky", "should this be an E2E?".
  Not for non-UI logic (use test-code) or outside-in black-box QA (use test-blackbox).
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# test-frontend — UI tests that break only when behavior breaks

Framework-level tests for **UI code** — components, composables/hooks, stores, forms, and
SSR/hydration — with the project's **own** runner. Part of the `wf-tester` team. Use this for the
front end; use `test-code` for non-UI logic and `test-blackbox` for outside-in checks with no source access.

> The goal is never coverage %. It's the **minimum valuable set** — the fewest tests that would catch a
> real regression, ordered by what hurts most if it breaks.

## The loop
1. **Classify** each file by *behavior* (not its folder).
2. **Score** its risk P0–P3.
3. **Pick** the test types that risk demands.
4. **Write** them deterministic and boundary-mocked.
5. **Report** what you tested, what you skipped, and why.

## 1 · Classify by behavior
A folder name is a hint, not a verdict — open the file and read what it does. A file can be several of these at once.

| Type | It is… |
|---|---|
| util / formatter / validator | pure input→output, no framework, portable |
| helper / business logic | a domain rule that drives a decision (pricing, eligibility, status) |
| composable / hook | `useX()` with reactive state or effects |
| store | global state (Pinia / Vuex / Redux / Zustand) |
| base component | reusable UI primitive, no domain |
| feature component / form | domain UI, a flow, submit / validation |
| data flow | action → state → API → UI |
| API layer | client calls + response mapping |
| server route / middleware | SSR endpoint, request middleware |
| SSR / client-only concern | touches `window` / `document` / hydration / cache |
| static quality concern | an anti-pattern (logic in template, `any`, an API call inside a base component) — a **lint / refactor** finding, *not* a runtime test |

## 2 · Score the risk (P0–P3)
**Automatic P0** — regardless of anything else — if the code touches: money / balance / pricing, order
or transaction creation, auth / session / token, permission enforcement, irreversible mutation,
sensitive-data exposure, a security-sensitive endpoint, user-specific SSR cache, or an area with a prior
production incident.

Otherwise weigh: financial · security · data-loss · business-complexity · user-facing · reuse · outage ·
bug-history (and SSR-cache **only if** the app is SSR). Higher and more numerous → higher priority.

| Priority | Depth |
|---|---|
| **P0** critical | unit (rules) + integration (flow) + contract (if API shape matters) + *selective* E2E |
| **P1** important | unit / component + integration |
| **P2** limited | unit *or* component/integration — only where real behavior exists |
| **P3** presentational | one render/output test; add prop/slot/event tests if those exist |

Downgrade one level for style-only changes, dead paths, or behavior already covered better elsewhere.
A file with **zero observable behavior** (pure CSS, raw SVG, `.d.ts`, empty re-export barrel) gets **no**
test — say so explicitly. "Simple" and "low-risk" are reasons to write a *short* test, not to skip.

## 3 · Pick the test types
Map type → tests, and only add a **scenario that exists in the code**:

- pure fn / formatter → **unit**; validator / business rule → **unit, table-driven**
- composable / hook, store → **unit + integration**
- base component → **component + interaction + a11y**; feature component / form → **component + integration**
- data flow / CRUD / detail page → **integration** (happy + error + loading + empty + not-found *as they exist*)
- API layer → **contract + integration**
- SSR-visible page (SSR confirmed) → **hydration / Web-Vitals safety**

Don't invent scenarios: no auth test without auth logic, no loading/error test without async, no SSR test
in an SPA, no E2E for simple low-risk CRUD.

## 4 · The E2E gate
E2E is expensive — reach for it **only** for: login / auth, payment / checkout, order or transaction
creation, permission-walled journeys, onboarding, a flow with a prior incident, or SSR Web-Vitals
regressions. Anything else: write "E2E not recommended — <reason>" and move on.

## Mocking — boundaries only
Mock only what crosses a boundary: HTTP / API client, router, storage, clock (`Date` / timers), browser
APIs, feature flags, analytics, notifications. **Never** mock the unit under test or an internal
same-feature module. If a test needs 3+ mocks or reaching into internals, that's a **testability smell** —
refactor the code for seams (extract the boundary) *before* writing the test.

## Make it deterministic
Fixed inputs; no real `Math.random`, real `Date.now`, or real network. Each test is self-contained — reset
shared state and clear mocks in `beforeEach`, build fresh data with factories. One behavioral focus per
test (it fails for exactly one reason). Snapshots only for small, stable outputs — never a whole page, and
never as a substitute for asserting behavior.

## Selectors
Prefer **stable, intention-revealing** selectors. Default to a test id (`data-testid`, named
`feature-element-type`, e.g. `checkout-submit-button`) so refactors and copy changes don't break tests.
Where a **role / accessible-name** query doubles as an accessibility assertion (buttons, inputs, dialogs,
menus), prefer that — a test that checks the accessible name earns its keep twice. Avoid CSS-class, tag,
and positional selectors.

## Honesty rules
- **A missing test package is a setup problem, not a skip.** Write the tests as if it's installed, then
  append a **Required Dependencies** block with exact install commands for the project's package manager.
  Never list a missing package under "not covered."
- **Document the gaps.** Every output states what you tested and why, and what you *deliberately* didn't
  and why. Silence about a skipped P0/P1 path is not acceptable.
- **A green suite bought by deleting assertions is a failure, not a pass.** The `guardian` gate enforces
  this; `cap-tdd` drives red → green → refactor; `testmedic` handles flakes.

## Framework notes
- **Vue / Nuxt** — Vitest + Vue Test Utils (Testing Library for user-centric queries), `@pinia/testing`
  for stores, `mount` / `flushPromises` for async; add SSR/hydration safety only when SSR is on.
- **React / Next** — Vitest or Jest + React Testing Library, MSW for HTTP contract tests; SSR/RSC safety
  only where server components or server data actually run.
- Detect the runner from the manifest and **match the project's existing conventions** — never introduce a
  second test framework alongside the one already in use.

## Output
A per-file test plan (type + risk + the scenarios that exist), the green tests themselves, a
**Required Dependencies** block if anything's missing, and a short **Confidence & Gaps** footer.

---
*Distilled from a production Vue/Nuxt front-end testing methodology by **Atur Dana** and **Saeed Nezafat**,
generalized here for any front end. Companions: `cap-tdd` (red→green→refactor), `testmedic` (flake triage),
`guardian` (the honesty gate).*

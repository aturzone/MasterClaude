---
name: fe-refactor
description: >-
  Restructure frontend code so it's testable, predictable, and correctly layered — without changing
  behavior. Pull pure logic out of framework glue, fix reactivity anti-patterns (derived state synced by a
  watcher/effect, logic in the view, effects with no cleanup, unstable list keys), name and place
  extractions right (util vs helper vs colocated), and keep the base ← common ← feature dependency
  one-way. Triggers on "refactor this component", "logic in the template/JSX", "this is hard to test",
  "watch/useEffect misused", "component does too much", "where does this helper go". Vue & React.
allowed-tools: Read, Grep, Glob, Write, Edit
---

# fe-refactor — make frontend code testable and predictable, without changing what it does

Structural refactoring for UI code. Its north star is **testability + correctness**, never cleanup for its
own sake. It's the companion to `test-frontend`: when a test needs 3+ internal mocks or the logic is buried
in a template/effect, fix the shape *here* first, then test.

## Three gates on every refactor
1. **Preserve behavior first.** Existing behavior is the source of truth. Don't change user-facing behavior,
   and never rename a **public contract** — props, emits/events, routes, API params, query keys, store
   fields, a composable/hook's return shape — unless a confirmed bug or the task requires it.
2. **Don't over-refactor.** The smallest safe, targeted change. No new dependencies, no folder restructure,
   no new architecture unless explicitly asked. Cheapest fix first — prefer a 10-line extract over a rewrite.
3. **Risk review *before* you touch code.** Scan the blast radius and put it in the plan: public API,
   SSR/hydration, duplicate fetching, async races, routing/SEO side effects, layout/stacking, and test
   fragility. If the only test that would break is one asserting on internal names, the *test* is fragile —
   say so; don't revert the refactor.

## Never refactor a P0 file without a safety net
```
Test possible without refactoring?      YES → write the test first, then refactor under green.
                                         NO ↓
Refactor is one small extract (~30 ln)? YES → refactor, then write the test.
                                         NO ↓
Is the file P0 (money / auth / data)?   YES → a high-level integration test as a net FIRST,
                                               then refactor incrementally, then unit-test the parts.
                                         NO  → escalate to a human; don't refactor blindly.
```
Never write tests around hopelessly tangled code — they lock the bad shape in place.

## The core move: separate pure logic from framework glue
Most testability pain is one thing — business logic tangled with reactivity and side effects. Pull them apart:
- **Extract the pure function** (calculation, mapping, validation) → testable with zero mocks.
- **Inject the dependency** (clock, storage, HTTP client) via a parameter or provide/inject → no global mocking.
- **Lift the side effect** (navigation, storage write, analytics) to the caller → the logic *returns data*; the component performs the effect.

*Example — a checkout composable/hook that mixes a discount rule, a direct `axios.post`, and a `router.push`:
extract `calculateOrderTotal(items)` (pure, table-testable), wrap the call in an `orderApi.create()` surface
(now mock one small thing), and return `lastOrderId` so the **component** owns navigation. Three tangled
concerns become three independently testable units.*

## Reactivity anti-patterns → the fix (Vue & React)
| Smell | Vue | React | Fix |
|---|---|---|---|
| Logic in the view | expressions in `<template>` | logic in JSX | move to a named `computed` / derive in render |
| Derived state synced by an effect | `watch(x, () => (y.value = …))` | `useEffect(() => setY(…))` | it's *derived* — `computed()` / compute during render (or `useMemo`) |
| Effect with no cleanup | `watchEffect` async, no `onCleanup` | `useEffect` sub/timer, no return | add cancellation/cleanup — kills races & leaks |
| Raw browser API / clock | `localStorage` / `Date.now()` inline | same | wrap in an injectable service; SSR-guard if SSR |
| Hidden global state | `useStore()` inside a helper | `useContext` inside a util | pass the value in as a parameter |
| Unstable list key | `:key="index"` on a dynamic list | `key={index}` | a stable domain id (`item.id`) |
| Inconsistent async shape | mixed `isLoading` / `result` / `err` | mixed | standardize (e.g. `{ data, pending, error, refresh }`) |

Confirm *valid* effects (real side effects: API, analytics, navigation, storage) as correct — don't flag them.

## Name the extraction right (a refactor with a bad name is incomplete)
- Functions = a specific verb: `calculateOrderDiscount()`, not `process()` / `handle()` / `calculate()`.
- Booleans = `is` / `has` / `can` / `should`: `isSubmitting`, `hasErrors`, `canDelete`.
- Computed / derived = the noun it produces: `activeItems`, `orderTotal` — not `filterItems`.
- Handlers = `handle…`: `handleSubmit`. Composables / hooks = `use…`: `useCheckout`.
- Parameters named for their **role** (`userId`, `orderData`), never `data` / `item` / `value` / `temp`. Expand abbreviations (`btn` → `button`).

## Where does the extracted code go?
Classify **before** naming a path — the default is almost never `utils/`.

| Target | It is… |
|---|---|
| **util** | pure, portable, no domain, no framework — reusable in any project (string / date / number helpers) |
| **helper** | project-specific domain logic, no reactivity (status mapper, domain formatter) — most extractions land here |
| **colocated** | belongs to *one* component / page → keep it beside that file (`Thing.helper.ts`), not in a shared folder |
| **composable / hook** | genuinely reactive (`useX`) — not a home for pure logic |

Keep domain logic close to its one caller; only lift to a shared layer at 2+ real call sites.

## When the structure itself is wrong — component tiers
Classify components by **behavior**, and keep the dependency arrow one-way:
- **base** — primitive, domain-free, presentational (`BaseInput`, `BaseModal`); no stores, no API, no domain text.
- **common** — domain-aware but presentational; maps status→label, formats a price; owns no feature flow.
- **feature** — owns a flow / state / API for one capability.
- **Dependency direction: `feature → common → base`.** A generic component must never import a more specific
  one (`base → feature` is forbidden). When it does, that coupling *is* the refactor.

## Output — a plan first, apply after approval
Produce a refactor **plan**: a **Risks** section; per issue *root cause → before/after → what becomes
testable*; a **Classification block** for every extraction (`util | helper | colocated` + the target path);
the changes ordered **cheapest-first**; and a **Confidence & Gaps** footer (assumptions, what you
deliberately left, context still needed). Apply only after the developer approves. *(If a static frontend
analyzer such as `frontend-guardian` is present, run it first and treat its output as unverified signals to
validate against the source.)*

## When NOT to use this
Code is already testable · the change is style-only · a big architecture change for a small test win · DI for
a pure util · a factory before data is duplicated 2+ times · splitting an already-small, focused component.

---
*Distilled from a production Vue/Nuxt refactoring methodology by **Atur Dana** and a collaborator, generalized
for any component framework. Companions: `test-frontend`, `cap-tdd`, `debtradar`.*

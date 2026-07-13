# Adding a service

A "service" is one deployed surface of the product under `apps/<name>/`. The first is `pwa`; a
typical setup also adds `website` (example.com), `blog`, `help` (faq), `api-docs`, `android` —
whichever surfaces the product actually has.
Everything under `packages/` is shared — a new service only adds per-service **content**.

## The mechanical recipe

```powershell
pnpm qa scaffold-service website --url https://example.com
pnpm install
```

`scaffold-service` copies `tools/templates/service/` into `apps/website/`, substituting
`__SERVICE__` and `__BASEURL__`. You get: `service.config.ts`, `playwright.config.ts`,
`checklist.json`, `envs/`, `agent-context.md`, one starter smoke task, `selector-memory/`,
`specs/tasks.spec.ts`, `specs/steps/`, and `data/`.

### What is copied (per-service state) vs shared (never copied)

| Copied into `apps/<name>/` | Shared in `packages/` (used, not copied) |
|---|---|
| tasks, checklist, selector-memory, aria-snapshots, baselines, status, envs, data | runner + step DSL, fixtures, assertions, reporters, risk gate, taxonomy, schemas |
| `service.config.ts`, `agent-context.md`, `specs/tasks.spec.ts` (3 lines), custom steps | Docker image, compose file, dashboard, CLI |

## Then

1. **Write `agent-context.md` first** — app description, login procedure, quirks, forbidden
   actions. It is the prerequisite for any agent execution, and it is prepended to every brief.
2. Fill `envs/*.json` (base URLs, allowed risk classes) and any `data/` references.
3. Author 3–5 class-`a` smoke tasks in the `s01-smoke` section (gate + stopOnFail).
4. Seed `selector-memory/` — or run the agent exploration task and let it propose selectors
   (w6), then `qa ingest`.
5. `pnpm qa validate --service website` and a first run:
   `pnpm qa run --service website --env production.test-account --section s01-smoke`.

## Note on per-service technology

Services can differ in tooling. `service.config.ts` carries `perfLane` (`lhci` |
`unlighthouse` | `none`) — public marketing surfaces (`website`, `blog`) suit an
`unlighthouse` whole-site crawl; an app like `pwa` suits `lhci` budgets on key routes. If a
surface renders to a canvas (e.g. a Flutter Web app), the DOM-based assertions in
`@mc-qa/assertions` won't see its content — see [testing-standards.md](testing-standards.md).
Other surfaces are usually normal HTML, so those assertions apply to them directly.

# Workflows

The end-to-end lifecycle and the six operational workflows. Start here.

## Run lifecycle

```
pnpm qa run --service example --env production.test-account [--section s01-smoke] [--risk a,b] ...
   │
   ├─ load service.config + env profile + .env
   ├─ load & VALIDATE all task JSONs (schema + id/path + selector keys) — broken files never run
   ├─ select (section / tags / risk / executor / task filters)
   ├─ GATE every candidate (risk-gate) → refusals listed in plan.json, never silent
   ├─ freeze results/<runId>/plan.json  (the contract for all lanes)
   ├─ dispatch lanes:
   │     script → playwright test (QA_* env) → ctrf/script.json
   │     cli    → lhci / linkinator → adapters → ctrf/cli-*.json
   │     agent  → emit brief.md + mcp.json (CI: skipped/manual-pending)
   │     human  → interview.md + form.html; inline interview if --interactive
   ├─ merge all ctrf/*.json → merged.ctrf.json
   ├─ compute the RELEASE GATE verdict (fail iff any gate section has a failed task)
   └─ update status/<profile>.json + runs.ndjson + checklist.md
```

Three executor lanes, one report. `results/<runId>/` is git-ignored; the committed truth is
`apps/<svc>/status/<profile>.json` (latest verdict per task), `runs.ndjson` (trend), and the
generated `checklist.md`. Human-readable HTML is Playwright's own report (trace viewer) plus
the separate `pnpm qa dashboard`. The process exit code follows the **release gate**: a failed
task in a `gate: true` section fails the run; failures in non-gate sections are reported but do
not block.

## w1 — Add a task
See [adding-a-task.md](adding-a-task.md).

## w2 — Add a service
See [adding-a-service.md](adding-a-service.md).

## w3 — Run local-headed vs Docker-headless
- **Local headed** (authoring/debug): `pnpm qa run --service example --env production.test-account
  --section s02-pwa --headed --workers 1`. Uses local Chrome; reuse session state to avoid
  burning OTPs.
- **Docker headless** (deterministic, CI-parity, the only place visual baselines are made):
  `pnpm qa run --service example --env production.test-account --docker`.
- Output either way: merged CTRF + HTML report + committed status update.

## w4 — Human interview session
```powershell
pnpm qa interview --service example --run <runId>          # walk the queued interviews now
```
The runner lists the queue with total minutes and physical prerequisites (real phone, bank
card). For each task it renders the questionnaire (terminal, or the self-contained `form.html`
that works from `file://` and downloads a `result.json`), computes the verdict from each
question's `passWhen`, enforces the **teardown checklist**, and merges the result as CTRF with
`verdictBy: "human"`. Offline variant: fill `form.html`, drop `result.json`, then `pnpm qa
ingest --run <runId>`.

The tester drives the browser themselves following the task's `procedure.steps` and the
interview's `setupChecklist` (the scripted pre-steps of a hybrid task are the human's runbook,
not machine-executed in this lane). For a hybrid task where you want the tooling to drive the
scripted steps and pause only at the human step, run it **headed** —
`pnpm qa run --task <id> --headed` — and answer the in-page overlay prompt.

## w5 — Triage a failure (decision ladder, in order)
1. **Infra/env?** OTP relay down, profile misconfig, network. → rerun, no task change.
2. **Selector rot?** Evidence shows the app is fine but a locator missed. → `qa verify-selectors`,
   heal the map (w6.4), rerun. Not an app bug.
3. **Flaky?** `--task <id>` a few times. Intermittent → set `lifecycle.flakiness.knownFlaky`,
   `status: quarantined` + `quarantinedUntil` (≤30d). Quarantined tasks are gate-refused (don't
   block) but stay visible.
4. **Test wrong?** Compare `oracle.expected` to documented behavior; check `lifecycle.sources`
   (did the FAQ change?). → fix the task, bump `updatedAt`.
5. **App bug.** File a finding (severity from `severityIfBroken`), link evidence + task id + env.
   The task stays red — red is information.

## w6 — Promote an agent-explored flow into a script (route memorization)
1. **Learning run** — an agent task explores and records an action log + selector proposals +
   aria snapshots + trace.
2. **Ingest** — `pnpm qa ingest --run <runId>` pulls `result.ctrf.json` and merges
   `learned-selectors.json` into `selector-memory/` as `provenance: "learned", state:
   "candidate"` (a git diff for PR review). Agents **propose**, humans **merge** — `authored`
   entries are never auto-modified.
3. **Curate** — a human turns the recorded actions into a deterministic script task (step DSL +
   `custom` steps), replacing raw locators with the new selector-map keys.
4. **Stabilize** — run it repeatedly across browsers; tighten waits into web-first assertions.
5. **Flip** — `executor: agent → script/hybrid`, but **keep the `agentBrief`** as the documented
   fallback + self-healing recovery path. The reviewer checks the forbidden-action envelope did
   not weaken.
6. **Verify selectors nightly** — `pnpm qa verify-selectors --service example` re-resolves every
   entry, updates `stability`, and flags entries below 0.6.

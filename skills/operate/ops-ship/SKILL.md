---
name: ops-ship
description: >-
  The pre-deploy gate. Triggers on "deploy", "ship it", "release", "cut a release", "push to prod", "roll
  it out", or editing a CI or deploy config. Produces a deploy brief with five required slots and a tagged
  release — or it refuses to call the deploy ready.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# The deploy gate — a brief with five filled slots, or it doesn't ship

A deploy is a change to a running system other people depend on. The gate is not "be careful" — it's a
**deploy brief** whose five slots are **structurally required**. An empty slot means the brief is
INCOMPLETE and the deploy is not ready. Not "proceed with caution" — not ready.

First, confirm where this is going: read `.skull/env` (run `ops-env-map` if it's stale). If the target is
production, you assemble the brief for a human to execute — you do not run the deploy yourself.

## The five required slots
| # | Slot | What fills it — and what an empty slot means |
|---|---|---|
| 1 | **Verify evidence** | The command you ran and its actual output: tests, build, typecheck, lint green. No output = unverified = not ready. |
| 2 | **Migration dry-run result** | The migration run against a copy, with its output — **or** the literal words "no schema change". Never blank. |
| 3 | **Rollback plan** | The exact revert commands and the direction you tested. "We'd figure it out" is not a plan (see `ops-rollback`). |
| 4 | **Blast radius** | Who and what breaks if this is wrong — which users, which services, which data. Name them. |
| 5 | **Flag / canary strategy** | Behind a flag, or canaried to N% with a rollback trigger — **or** one sentence on why neither fits. |

Write the brief to `.skull/deploy-<date>.md`. A reviewer should green-light it without re-deriving any slot.

## Tag the release — every time
```bash
git tag -a v1.4.2 -m "release notes" && git push origin v1.4.2
```
The tag is what `ops-rollback` redeploys and what `ops-incident` points at. An untagged deploy is one you
can't cleanly name later — which means one you can't cleanly revert.

## Size the gate to the change
- **Schema migration, auth, payments, data backfill** → all five slots argued in full; a canary is not optional.
- **Copy tweak, config value, static asset** → the slots still get answered, but "no schema change" and a
  one-line rollback are complete answers. The gate is proportionate, never skipped.

## Red flags — stop, the brief is lying
A slot filled with "should be fine" / "N/A" where a real answer belongs · "we'll test in prod" · a rollback
plan nobody has ever run · a migration that only goes forward · deploying Friday afternoon with no one
watching the graphs. Each is an incomplete brief wearing a checkmark.

---
*Pairs with `ops-env-map` (prove the target first) and `ops-rollback` (the plan slot 3 demands). Credits:
change-management and canary / progressive-delivery discipline from standard SRE practice.*

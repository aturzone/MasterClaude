---
name: cap-execute-plan
description: >-
  Drive an approved plan or spec to done — supervised, one verified step at a time. Triggers on "execute
  the plan", "work the backlog", "build it from the plan/spec", "implement this plan", or right after
  cap-plan-first / cap-decomposer / grill-me produced a plan. Works the tasks in order, verifies each
  (build/tests) before moving on, checkpoints with you at the risky/irreversible steps, and keeps a
  progress trail. You stay in the loop the whole way, verifying each step.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Task
---

# Execute the plan — supervised, verified, step by step

A plan only matters if it ships. This turns an approved plan/spec into working, verified code — without the
two failure modes: drifting from the plan, or barrelling past a broken step.

## Before you start
- You need an **approved** plan (from `cap-plan-first` / `cap-decomposer` / `grill-me`). If there isn't one,
  make one first — don't improvise a big build.
- Confirm the **definition of done** and the **verify command** (how you'll prove each step works).
- **Read the whole plan first and critique it** — surface gaps/contradictions/unclear steps to the user
  *before* task 1; don't execute a plan you don't believe in.
- **Branch safety:** if you're on `main`/a shared branch, switch to a working branch first (or get explicit
  consent). For a large, independent-task plan, prefer **subagent-orchestration** (a fresh implementer per
  task); keep inline execution for small ones.

## The loop (one task at a time)
1. **Take the next task** in order; respect dependencies. State what you're about to do in a line.
2. **Implement** the smallest correct change for *that* task — nothing the task doesn't call for.
3. **Verify** — run the build/tests/the step's check. **A task isn't done until it's proven.** If it fails,
   fix it before moving on; never leave a red step behind.
4. **Record** — mark the task done; note what changed + the proof. Commit at each green step (a working
   branch), so any step is easy to undo.
5. **Checkpoint at the risky ones** — before anything **irreversible or high-stakes** (a destructive
   migration, a schema change, touching prod/secrets, a big architectural commit), **pause and confirm**
   with the user. Everything else, keep moving.
6. **Re-plan when reality diverges** — if a task reveals the plan was wrong, stop, say so, adjust the plan,
   and continue. Don't force a broken plan.

## Stay honest
- Don't weaken a test or skip verification to "make progress." Green means green (Guardian holds here).
- If you can't verify a step locally, say so explicitly rather than claiming it's done.
- Keep the trail visible so the user can follow without re-reading the diff.

## Stop and ask · then finish the branch
- **Stop and ask** (don't guess) on: a missing dependency, a verification that fails repeatedly, an
  instruction you don't understand, or a real plan gap.
- **Check against the plan:** verify each step against its stated **expected output**, not just "exit 0";
  before a task, confirm its *Consumes* interfaces actually exist from earlier tasks.
- **Finish the branch.** When the last task is green: run the **full** suite once more, summarize what
  shipped, and offer the wrap-up (open a PR / merge / delete the branch) — don't just stop at the last commit.

---
*Credits:* the plan→execute-with-verification discipline echoes **superpowers** writing-plans/executing-plans
(`obra/superpowers`, MIT). See `docs/ECOSYSTEM.md`. Pairs with **cap-plan-first** + **cap-decomposer**.

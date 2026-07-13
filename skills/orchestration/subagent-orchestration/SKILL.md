---
name: subagent-orchestration
description: >-
  How MASTER CLAUDE delegates work to subagents and teams. Triggers on "delegate", "spawn agents",
  "parallel agents", "fan out", "run these in parallel", "subagent", "orchestrate", "build a team for
  this", or whenever a task splits into independent chunks, needs a fresh-eyes review, or means reading
  many files. Teaches the orchestrator-worker pattern: pick the right primitive (subagent vs agent-team
  vs background session), write a complete delegation brief, parallelize only when it pays, scale effort
  to the task, and verify with an adversarial reviewer. Use to plan and run any multi-agent push.
allowed-tools: Read, Grep, Glob, Bash, Task
---

# Subagent orchestration — the leader's delegation playbook

You're the **orchestrator**. Your job isn't to do everything in one context — it's to **decompose, dispatch,
and synthesize**. Done well this is force-multiplying; done carelessly it just burns tokens. This skill is
how to do it well.

## Pick the right primitive
| Primitive | What it is | Best for |
|---|---|---|
| **Subagent** (`Task`/`Agent` tool) | A worker with its own **isolated** context; returns only a summary to you | Research/exploration, reading many files, a fresh-eyes review, isolating verbose output, independent parallel work |
| **Agent team** (experimental) | Several full sessions sharing a task list + mailbox; teammates talk to each other | Work that needs debate/coordination across layers, competing-hypothesis debugging |
| **Background session / worktree** | A separate `claude` you run/monitor | Big fan-out migrations, long isolated experiments |

Default to **subagents in an orchestrator-worker shape** — it handles the most cases with the least
coordination overhead. Reach for a team only when workers genuinely need to talk mid-flight.

## When to parallelize vs stay serial
**Parallelize** (spawn multiple subagents in *one* message): understanding needs **10+ files**; there are
**3+ genuinely independent** pieces; you want an unbiased second opinion; or distinct lenses on one artifact
(security / perf / tests). **Stay serial / single-session**: steps are **dependent** (output feeds the
next); **edits to the same file** (parallel writers clobber each other); the task is small; or phases share
heavy context. Note: **implementation coding often doesn't parallelize** (shared context, dependencies) —
research, review and audits do.

## Write a complete delegation brief (the #1 failure is vagueness)
Every subagent prompt must carry **four things**, because a fresh subagent sees *none* of your context or
files:
1. **Objective** — the one specific goal.
2. **Output format** — exactly how to return results (so you can merge them).
3. **Tools / sources** — what to use, what to prioritize, what to ignore (e.g. "skip `vendor/`").
4. **Boundaries** — its scope, so two workers don't collide or duplicate.
Put must-have rules *in the prompt* — non-fork subagents don't read CLAUDE.md or your history.

## Scale effort to the task (don't spawn 20 agents for a one-liner)
| Task | Agents |
|---|---|
| Simple fact / one file | 1 (or just do it yourself) |
| Compare a few options | 2–4 subagents |
| Broad / open-ended | many, with clearly divided scope |
Teams: start **3–5** teammates, ~5–6 tasks each — "three focused beat five scattered."

## Verify — the payoff of orchestration
After work is "done", dispatch a **fresh subagent to review the diff against the plan** — it sees only the
diff + criteria, not the reasoning that made it, so it grades honestly. For findings, use **two loops**:
one reviewer for spec-compliance, one for code-quality; batch the fixes into a fix-agent; re-run the *same*
reviewer to confirm. Tell reviewers to flag only real correctness/requirement gaps (a reviewer told to
"find problems" always finds some — that invites over-engineering). **If you can't verify it, don't ship it.**

## Run it like a loop (not a one-shot)
- **Worker return contract.** Require each worker to end with a status: `DONE` · `DONE_WITH_CONCERNS` ·
  `NEEDS_CONTEXT` (re-dispatch the *same* worker with the missing piece) · `BLOCKED` (assess — if the *plan*
  is wrong, escalate to the user; don't blind-retry). The status decides your next move.
- **Hand off via files, not chat.** Give each worker a short brief; have it write its full report to a named
  file (`task-N-report.md`) and return only status + commit range + a one-line test summary + concerns.
  Reviewers/fix-agents read & append that file. This is the fix for your own "workers re-bloat my context" trap.
- **Pre-flight the plan once.** Before task 1, scan the whole task set for contradictions/conflicts and
  surface them to the user in one batch — don't discover them mid-run.
- **Reviewer hygiene.** Copy the binding constraints **verbatim** into the reviewer prompt; hand the diff
  **as a file**; don't pre-rate severity or name what to ignore; don't ask it to re-run tests already run.
  Dispatch fixes for **Critical/Important** only; log **Minor** for the final whole-branch pass (top model, explicit).
- **Keep a durable ledger.** Append `Task N: done (<base7>..<head7>, review clean)` to a tracked file the
  instant a task passes. After a compaction/restart, trust the ledger + `git log` and **never re-dispatch a
  completed task**.

## Economics (be honest about cost)
A subagent run costs more tokens than inline; a full multi-agent push can be ~10–15×. Token spend explains
most of the quality gain — so **only go multi-agent when the task's value justifies it.** Pair this with
**model-router** to put cheap models on cheap work.

## Don'ts
Vague delegation · same-file parallel edits · over-decomposing a small task · too many overlapping
specialists (auto-delegation gets unreliable) · letting every worker dump huge output back (re-bloats your
context) · trusting without verifying.

---
*Credits / further reading (install alongside MASTER CLAUDE if you like them):* Anthropic's
[multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) &
[subagents docs](https://code.claude.com/docs/en/sub-agents); the parallel-dispatch + two-loop-review
patterns are sharpened in **superpowers** (`obra/superpowers`, MIT). See `docs/ECOSYSTEM.md`.

---
name: cap-write-plan
description: >-
  Turn an approved spec + decomposition into a precise, zero-context implementation plan document that
  another engineer (or a fresh subagent) can execute with no prior knowledge. Triggers on "write the plan",
  "write an implementation plan", "turn this spec into a plan", or after grill-me/cap-spec-smith +
  cap-decomposer have produced a spec and a step list, before any code. Each task carries exact file paths,
  interface contracts, real test code, exact commands and their expected output — no placeholders. The plan
  is the contract; cap-execute-plan (or parallel subagents) runs it.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Write the plan — a zero-context, executable build document

A spec says *what* and *why*; a plan says *exactly how*, task by task, so precisely that someone with **no
prior context** (a teammate, a fresh subagent) can build it correctly without guessing. If a step makes the
reader infer, it isn't done. Write it before any code.

## Inputs & output
- **In:** an approved spec (from `cap-spec-smith` / `grill-me`) + a decomposition (from `cap-decomposer`).
  No spec yet? Stop and get one first — don't plan against a fuzzy goal.
- **Out:** a plan doc saved to `.mc/plans/<date>-<feature>.md` (or the repo's convention).
- **Scope check:** a spec spanning multiple independent subsystems → **one plan per subsystem**, each
  independently testable and shippable.

## Plan header (required)
- **Goal** — one sentence.
- **Architecture** — 2–3 sentences (how the pieces fit), tech stack.
- **Global constraints** — copied **verbatim** from the spec (exact values, formats, relationships), one per
  line. These bind every task; the executor and any reviewer read them literally.
- **Execution** — state how it'll run: inline (`cap-execute-plan`) or via parallel subagents
  (`subagent-orchestration`) — so the executor routes correctly.

## Per-task block (required)
Size each task to the **smallest unit worth its own review gate** — fold its setup/config/scaffolding/docs
into it. Then specify:
- **Files** — `Create <exact path>` · `Modify <path:line-range>` · `Test <exact path>`.
- **Interfaces** — *Consumes* (signatures/types this task relies on from earlier tasks) and *Produces*
  (function names + param/return types it exposes downstream). This is what makes tasks composable across
  fresh sessions.
- **Steps** — checkboxes, each ONE 2–5 minute action, in the TDD order:
  `write failing test → run it (see it fail for the right reason) → minimal code → run (see it pass) → commit`.
  Each step has the **complete code** (no pseudocode), the **exact command**, and its **expected output**.

## No placeholders (the ban list)
- No `TBD` / `TODO` / "future implementation" / vague "add error handling/validation/edge cases" — name the
  specific ones.
- No "similar to Task N" — repeat the actual code.
- No "write tests" step without the real test code.
- No undefined types/functions; always exact paths; complete code in every code step; exact commands +
  expected output. Apply DRY / YAGNI; commit at each green step.

## Self-review before you hand it off
1. **Coverage:** map every spec requirement → a task; add any missing.
2. **Placeholders:** scan for the ban list above; resolve each.
3. **Type consistency:** every task's *Consumes* signatures actually exist in some earlier task's *Produces*.
4. **Right-sized:** a reviewer could accept/reject each task independently; no task is too big to verify.

## Hand off
Pass the plan to **cap-execute-plan**, which runs the tasks in order, verifies each against its stated
expected output, and checks each task's *Consumes* exist before implementing it. For a large
independent-task plan, **subagent-orchestration** can run a fresh implementer per task.

---
*Credits:* the zero-context, interfaces-per-task, no-placeholders, TDD-structured plan format is from
**superpowers** `writing-plans` (`obra/superpowers`, MIT). See `docs/ECOSYSTEM.md`. Pairs with
**cap-spec-smith** + **cap-decomposer** (before) and **cap-execute-plan** (after).

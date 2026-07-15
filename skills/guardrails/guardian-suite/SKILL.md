---
name: guardian-suite
description: >-
  The guardrail switchboard. Triggers on "which guardrails are on?", "turn on / turn off <guardrail>",
  "set up guardrails for this project", or when a guardrail keeps firing and the developer wants it quieter.
  Records the choice in .claude/master-claude.json so it survives the session; the leader honours it.
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Guardian Suite — which guardrails are on, and where

The switchboard for the guardrail suite. **The switch is a config file, not a command** — there is nothing to
install and nothing running in the background.

## The suite
`guardian` (scope + verification) · `supplyguard` (dependencies) · `testmedic` (flaky tests) ·
`debtradar` (churn × complexity) · `compactor` (long sessions) · `cap-tdd` (red-green-refactor).
Adjacent, and always on when installed: `sentinel` (the cartographer agent).

## The switch
Per project, `.claude/master-claude.json`:

```json
{ "defaultGuardrails": ["guardian", "supplyguard"] }
```

Absent the file, the leader picks a minimal set for the project and says which. Naming a guardrail here makes it
the standing default so nobody has to re-ask each session. To silence one, remove it and say so out loud — a
guardrail that was quietly dropped is worse than one that was never on.

## Report state honestly
When asked which are on, answer from the file plus what this session actually invoked — **not** from what the
category README lists. If the file is absent, say "no standing config; the leader chose these for this session"
rather than implying persistence that isn't there.

## What this is not
These are **prose disciplines the model follows**, not interception. Nothing in this suite can block a tool call,
survive a `/clear` on its own, or catch a rule the model talks itself out of. A rule that must hold every time
belongs in a `PreToolUse` hook or a `permissions.deny` rule in settings — both are the developer's to install,
deliberately. Say so plainly when someone asks whether a guardrail will "stop" something.

---
*Pairs with `workspace-architect` (what this project's `.claude/` should hold). The leader reads the same file.*

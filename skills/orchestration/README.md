# orchestration/ — build the team, spend the context well

Skills here decide *who* does the work, *which model* does it, and *what fits in the window*. They are the
difference between one Claude grinding a long session and a team that finishes.

**Current members**
- `subagent-orchestration` — when to delegate, the four-part brief, and verifying with a fresh reviewer.
- `model-router` — the right model per agent/task (Opus lead · Sonnet workers · Haiku scouts). Turn count
  beats token price: the cheapest model often takes 3× the turns and costs more.
- `token-economy` — the best output per token: terse by default, isolate verbose work, stay cache-warm.
- `context-engineering` — curate the window: cache-stable prompts, retrieve-don't-dump, audit MCPs, measure.
- `fleet` — dispatch the team to separate parallel Claude Code sessions. N sessions ≈ N× usage; cost-capped
  and opt-in, never a default.
- `workspace-architect` — what *this* project's `.claude/` should hold: a lean CLAUDE.md, the right skills and
  agents, a real verify path.
- `worktree-isolation` — parallel or risky work without collisions. Prefer the harness's native worktree
  support over hand-rolled `git worktree` bash — a managed tool leaves no phantom state.
- `skull-git` — the git working discipline the leader delegates to: session awareness, branch-before-you-build
  (`mc/<slug>`), commit at every green step (`Fixes #N`), a WIP commit before risky bash. The bright line —
  local git aggressive by default, remote git always consented, **never auto-push**. `disable-model-invocation`.

**Brainstorm — what else belongs here** (great first contributions)
- `handoff-brief` — pack a session's state into a brief a fresh session can start cold from.
- `cost-forecast` — estimate what a fan-out will actually spend before dispatching it.
- `agent-memory` — use a subagent's `memory:` for cross-session learning without polluting the main window.
- `workflow-authoring` — when to reach for a dynamic workflow instead of in-session subagents.

**Add one:** create `skills/orchestration/<your-skill>/SKILL.md`. See [CONTRIBUTING](../../CONTRIBUTING.md).

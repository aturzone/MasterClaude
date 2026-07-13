---
name: fleet
description: >-
  Run the team across SEPARATE, parallel Claude Code sessions for real throughput — beyond in-session
  subagents. Triggers on "make it faster", "too slow", "parallelize", "run the team in separate sessions",
  "fan out", "background agents", "agent teams", "run several at once", or a big batch of independent work. The
  leader decomposes the job into independent chunks, dispatches each to its own session (true OS-level
  parallelism), monitors, and integrates — with hard guardrails on cost and isolation, because N parallel
  sessions burn usage N× and editing the same files in parallel causes merge hell.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Task
---

# Fleet — the team in parallel sessions

In-session subagents (the `Task` tool) share one process and run mostly *one at a time* through the parent. For
real speed on **independent** work, dispatch the team to **separate Claude Code sessions** that run in true
parallel — each its own process and fresh context. That's the fleet. Used well it's a big speedup; used wrong it
burns your quota and creates merge conflicts. The guardrails below are the point.

## First decide: should you fan out at all?
| Fan out to parallel sessions | Keep it in one session (subagents or sequential) |
|---|---|
| chunks are **independent** (separate files/modules, parallel investigations, per-item work) | edits touch the **same files**, or steps depend on each other |
| the speedup is worth **N× the usage** | quota is tight / the job is small |
| little back-and-forth needed between chunks | frequent coordination is needed (cheaper in one context) |

Default to **subagent-orchestration** (in-session) for most work; reach for the fleet only when the work is
genuinely parallel and big enough to matter.

## The mechanisms (pick the lightest that fits)
1. **Background sessions — the default** (interactive). Dispatch each chunk to its own full session:
   ```bash
   claude --bg "review src/auth/ for IDOR"     # or /bg inside a session
   claude agents          # monitor all running sessions
   claude logs <id>       # peek  ·  claude attach <id> — interact with one
   ```
   The supervisor manages concurrency and **auto-isolates each session in its own git worktree**, so parallel
   *edits* never collide. State lives under `~/.claude/jobs/`. This is the recommended way to fan out.
2. **Agent teams — when teammates must talk** (experimental: `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).
   Spawn teammates that share a **task list** and a **mailbox** (they message each other via `SendMessage`).
   Start with **3–5**. Caveats: in-process teammates **don't survive `/resume`**, one team per session, no
   nested teams.
3. **Git worktrees — isolate parallel edits.** Give each writer its own branch + working directory so
   concurrent edits never clobber each other (background sessions do this for you automatically; reach for it
   directly when you dispatch your own parallel editors). See **worktree-isolation**.

## The leader's flow
1. **Decompose** — break the goal into independent, similarly-sized chunks (use `cap-decomposer`). Name each
   chunk's owner files so **no two workers touch the same file**.
2. **Dispatch** — one session per chunk, **≤ 3–5 at a time**. For edits, prefer background sessions
   (auto-worktree) or give each its own worktree (`worktree-isolation`). For analysis/review, have each
   background session write its findings to a named file.
3. **Monitor** — `claude agents` (background) or the team's shared task list. Don't micromanage — workers are autonomous.
4. **Integrate** — collect each worker's result, resolve any overlap, synthesize the final output, and **verify
   the merged whole** (build/tests). A green per-worker result doesn't guarantee a green merge.

## Guardrails (do not skip — this is where mistakes happen)
- **Cost is linear.** N parallel sessions ≈ **N× the token/usage burn**, and you can hit usage limits N× faster.
  Cap concurrency (3–5), and only fan out when the speedup earns it.
- **Never two workers on one file.** Give each chunk disjoint files, or isolate with worktrees. Same-file
  parallel edits = lost work. The leader owns the merge and the final verify.
- **No-resume gotcha.** Background workers are one-shot; if one wedges, **spawn a replacement** rather
  than trying to resume it.
- **Opt-in & safe.** The fleet is just Claude Code's own built-in fan-out — background agents, agent teams, and
  git worktrees — so **every session runs with normal permissions** (no permission-skipping runner, nothing
  headless, nothing auto-fans-out; you dispatch each one). The same safe-by-default rules and catastrophe rails
  hold as the rest of MASTER CLAUDE (no money, no destroying real data, no exfiltration, stay in the project).
  See [SECURITY.md](../../../SECURITY.md).

---
*Built on Claude Code's own primitives — background agents, agent teams, and git worktrees. Complements
`subagent-orchestration` (in-session), `worktree-isolation` (isolation), and `model-router` +
`context-engineering` (cost). Doc links in docs/ECOSYSTEM.md.*

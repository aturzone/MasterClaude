---
name: workspace-architect
description: >-
  How SKULL builds the best Claude Code workspace for a project. Triggers on "set up my
  workspace", "configure .claude", "CLAUDE.md", "what should this project have", "make this project
  Claude-ready", "best setup for this repo", or at the start of working in any project. Decides what each
  project's .claude/ should contain — a lean CLAUDE.md, the right skills/agents/settings/hooks/MCP, tuned
  to the stack and goal, with a real verification path — and avoids the bloat that makes Claude ignore
  half its own config.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Workspace architect — the best `.claude/` for *this* project

A great workspace is the difference between a session you babysit and one you can walk away from. Build the
**smallest setup that makes Claude reliable here** — then stop. More config is not better; a bloated setup
makes Claude ignore half of it.

## What goes where
| Component | Lives in | For | Loaded |
|---|---|---|---|
| **CLAUDE.md** | repo root (commit) · `CLAUDE.local.md` (gitignore) · `~/.claude/` (global) | Context Claude can't infer | **every session** — keep small |
| **Skills** | `.claude/skills/<name>/SKILL.md` | Sometimes-relevant knowledge/workflows | on demand |
| **Agents** | `.claude/agents/*.md` | Isolated/parallel specialist workers | at start |
| **settings.json** | `.claude/settings.json` (shared) · `.local.json` (personal) | Permissions, env, hooks | at start |
| **Hooks** | in settings.json | Things that must happen *every time* | event-driven |
| **MCP** | `.mcp.json` | External systems you actually use | at start |

**Decision rule:** CLAUDE.md for what's *always true* · skills for *sometimes-relevant* · agents for
*isolated/parallel* · hooks for *must-happen-every-time* · MCP for *external systems*.

## CLAUDE.md — the make-or-break file
Start with `/init`, then **prune hard**. Litmus test for every line: *"Would removing this make Claude make
a mistake? If not, cut it."*

| ✅ Include | ❌ Cut |
|---|---|
| Build/test/lint commands Claude can't guess | Anything it learns by reading the code |
| Style rules that **differ from the language default** | Standard conventions, "write clean code" |
| The test runner + how to verify | File-by-file descriptions |
| Repo etiquette (branch/PR rules), env quirks, real gotchas | Stuff that changes often (link instead) |

If Claude keeps breaking a rule, the file is too long — prune it or convert the rule to a **hook**.

## Tailor to the stack & goal
- **Install the CLIs and tell Claude to use them** (`gh`, `aws`, `gcloud`, `docker`…) — CLIs are the most
  context-efficient external interface; `gh` also dodges API rate limits.
- **Typed language** → add code-intelligence (precise symbol nav + post-edit error checks).
- **Connect MCP only for systems in real use**; scope a noisy MCP server to a single agent so its tool
  descriptions don't eat the main context.
- **Give Claude a verification path that fits the stack** — test command, build exit code, linter, or a
  browser screenshot vs. a design. This is the single highest-leverage investment.

## Effective vs. bloated
**Effective:** lean CLAUDE.md · a few focused agents with sharp `description`s and least-privilege `tools`
· skills for on-demand knowledge · hooks only for the must-always · one clear verify command · permissions
tuned so you're not click-fatigued. **Bloated (avoid):** giant CLAUDE.md → ignored rules · many overlapping
agents → unreliable auto-delegation · agents inheriting all tools · MCP "just in case" · documenting what
Claude already knows.

## How SKULL sets a project up
1. **Map first** (Stage 2 / Sentinel) — stack, structure, gaps, how they verify.
2. **Write/prune CLAUDE.md** to the essentials above (or improve theirs).
3. **Add only the skills/agents this project needs** — the leader's tailored team, not the whole catalog.
4. **Wire the verification path** + the handful of must-run hooks; tune permissions.
5. **Confirm it works** (run the build/tests once) and tell them what you set up and why.

---
*Credits / further reading:* Anthropic
[Claude Code best practices](https://code.claude.com/docs/en/best-practices) &
[subagents docs](https://code.claude.com/docs/en/sub-agents). See `docs/ECOSYSTEM.md`. Pair with
**subagent-orchestration** + **model-router**.

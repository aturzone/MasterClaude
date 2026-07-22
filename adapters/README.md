# SKULL adapters — run SKULL in any agent

SKULL started as a Claude Code team. As of **v3** it's the same lead engineer, portable to **any** AI
coding agent. This folder is how.

## The idea: one neutral core → each agent's native config

SKULL's methodologies (the leader + the skills) are agent-neutral Markdown. Two open standards make them
portable, so we mostly just point each agent at the right files:

- **`AGENTS.md`** — the universal *instructions* file. An open Markdown standard (Linux Foundation, 2025)
  that **every major agent reads**. Our portable leader lives at [`universal/AGENTS.md`](universal/AGENTS.md).
- **`SKILL.md`** — the de-facto *skills* standard (Anthropic's Agent Skills format), now read by Cursor,
  Codex, OpenCode, Windsurf, Gemini CLI, Cline, and Hermes. SKULL's `skills/` are already in this format.

## Fastest path (works in almost every agent)

1. Copy the portable leader into your project root as `AGENTS.md`:
   ```bash
   cp adapters/universal/AGENTS.md ./AGENTS.md
   ```
2. Copy the skills into a location your agent scans (the neutral cross-tool dir is `.agents/skills/`; many
   agents also read `.claude/skills/`):
   ```bash
   mkdir -p .agents/skills && cp -r skills/* .agents/skills/
   ```
3. Ask your agent to "read AGENTS.md and act as SKULL — set up my team for this project."

That's it — no CLI, nothing runs on its own. (A `skull` CLI that automates this per agent is planned for
later; until then it's copy-the-right-files, on purpose — see [`../docs/V3-PLAN.md`](../docs/V3-PLAN.md).)

## Where each agent wants the files

| Agent | Instructions → put the leader in | Skills dir | Tier |
|---|---|---|---|
| **Claude Code** | native `skills/skull/SKILL.md` (or `CLAUDE.md`) | `.claude/skills/` | native |
| **Cursor** | `.cursor/rules/skull.mdc` (or `AGENTS.md`) | `.cursor/skills/` | native |
| **Codex CLI** | `AGENTS.md` | `.codex/skills/` or `.agents/skills/` | native |
| **OpenCode** | `AGENTS.md` | `.opencode/skills/` (also reads `.claude/skills/`) | native |
| **Hermes (Nous)** | `AGENTS.md` + `MEMORY.md` | `~/.hermes/skills/` | native |
| **Gemini CLI** | `GEMINI.md` or `AGENTS.md` | `skills/…/SKILL.md` | good |
| **Cline** | `.clinerules/` or `AGENTS.md` | `.cline/skills/` | good |
| **Windsurf** | `.windsurf/rules/` or `AGENTS.md` | `.windsurf/skills/` | good |
| **Aider** | `CONVENTIONS.md` (read-only) | — (no skills system) | basic |
| **Continue.dev** | `.continue/rules/` or `AGENTS.md` | — (no skills system) | basic |

**Tiers (honest expectations):**
- **native** — full: leader + skills + subagents + commands (+ hooks where the agent supports them).
- **good** — leader + skills + instructions; subagents/commands vary by agent.
- **basic** — instructions only. Aider and Continue.dev have no skills system, so SKULL's *method* ports as
  prose via `AGENTS.md`/`CONVENTIONS.md`, but skills aren't invocable. Say so; don't pretend parity.

## Per-agent adapters

Ready-made native files for specific agents live in sibling folders (each with its own README of exact copy
commands):

- [`universal/`](universal/) — the portable `AGENTS.md` (start here; covers every agent above).
- `cursor/` — a native `.cursor/rules/skull.mdc`.
- `codex/` — `AGENTS.md` + `.codex/` notes.
- `hermes/` — `AGENTS.md` + `MEMORY.md` seed + cron examples.

> The `skills/` folder is the single source of truth for capabilities — don't fork it per agent. Adapters
> only carry the thin, agent-specific *wrapper* (which instructions file, which skills path).

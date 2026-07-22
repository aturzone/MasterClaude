# SKULL v3 — Design & Roadmap (RFC)

> **Status:** Draft · **Date:** 2026-07-22 · **Target:** `v3.0.0`
> **One line:** SKULL grows from *a Claude Code team* into **the universal manager for AI coding
> agents** — the same lead engineer, now portable to any agent, that also stocks each project with the
> right external tools.

This is a living plan. It's grounded in a July 2026 survey of the agent ecosystem (see §3) — not memory.
Edit it freely; it's an RFC, not a contract.

---

## 1. Vision

v2 is a *team that lives inside Claude Code*. v3 is *the same leader, running in **any** agent, that
recommends and installs the right tools per project.* Three moves:

1. **Universal** — run in Claude Code, Cursor, Codex, Hermes, OpenCode, Gemini CLI, … not just Claude Code.
2. **The Secret Shop** — SKULL scans a project, recommends the right external tools, and (with your yes)
   **installs and registers** them so the leader then *uses* them.
3. **Archive-aware** — learn from the 15k-skill public hub; fill SKULL's real coverage gaps; recommend
   hub skills on demand.

We keep the soul: the decisive lead-engineer character, the 7-stage lifecycle, findings→issues, safe-by-default.

## 2. What v2 already is (build on it — do not rewrite)

v2 = ~72 skills across 11 categories + 4 read-only agents (Sentinel, security-auditor, tester, designer)
+ the `skull` leader + hooks + the 7-stage lifecycle + a proactive "offer the right tool" table +
`docs/ECOSYSTEM.md` (already recommends external tools). **Most SKILL.md bodies are already
agent-neutral prose** — they teach *how to think*, not Claude-specific API calls. The Claude-specific
surface is thin and known: `allowed-tools`, the Task tool, `.claude/` paths, `.mjs` hooks. v3 is mostly
**portability + a tool engine + archive harvest**, not redoing content.

## 3. The landscape (verified July 2026) — two primitives make this realistic

The industry converged on exactly the two standards SKULL needs to compile *to*:

- **`AGENTS.md` — the universal instructions file.** Open Markdown at repo root (nested files win locally).
  Launched by OpenAI/Google/Cursor/Factory/Sourcegraph; **donated to the Agentic AI Foundation (Linux
  Foundation) in Dec 2025**. Spec: <https://agents.md>. **All 10 agents surveyed read it.**
- **`SKILL.md` — the de-facto skills standard.** Anthropic's format (folder + `SKILL.md`, frontmatter
  `name` 1–64 lc-hyphen + `description` 1–1024, progressive disclosure). Adopted by Cursor, Codex,
  OpenCode, Windsurf, Gemini CLI, Cline, **Hermes**. A neutral cross-tool path is emerging: **`.agents/skills/`**
  (Codex + OpenCode scan it; several also read `.claude/skills/`).

### Support matrix (load-bearing facts for the compiler)

| Agent | Instructions | Skills (SKILL.md?) | Subagents / commands | Hooks | AGENTS.md |
|---|---|---|---|---|---|
| **Claude Code** | `CLAUDE.md`, `.claude/settings.json` | ✅ `.claude/skills/` (origin) | `.claude/agents/`, `.claude/commands/*.md` | `settings.json` hooks | ✅ |
| **Cursor** | `.cursor/rules/*.mdc` | ✅ `.cursor/skills/` (2.4+) | subagents; `.cursor/commands/*.md` | `.cursor/hooks.json` | ✅ |
| **Codex CLI** | `AGENTS.md`, `.codex/config.toml` | ✅ `.codex/skills/`, `.agents/skills/` | `~/.codex/prompts/*.md` | `notify` (config.toml) | ✅ primary |
| **Cline** | `.clinerules/` | ✅ `.cline/skills/` (3.48+) | `.clinerules/workflows/*.md` | SDK plugins | ✅ |
| **Windsurf** | `.windsurf/rules/` | ✅ `.windsurf/skills/` | `.windsurf/workflows/*.md` | — | ✅ |
| **Aider** | `CONVENTIONS.md`, `.aider.conf.yml` | ❌ none | built-in slash cmds | `--lint/--test-cmd` | ✅ |
| **OpenCode** | `AGENTS.md`, `opencode.json` | ✅ `.opencode/skills/` (+reads `.claude/skills/`) | agent-md files; `command`s | plugin hooks | ✅ primary |
| **Gemini CLI** | `GEMINI.md`, `.gemini/` | ✅ `skills/…/SKILL.md` | commands are **TOML** in `.gemini/commands/` | `hooks/hooks.json` | ✅ |
| **Continue.dev** | `.continue/rules/*.md` | ❌ none (Hub "blocks") | Hub prompt blocks | — | ✅ |
| **Hermes (Nous)** | `AGENTS.md` + `MEMORY.md` + memory tool | ✅ `~/.hermes/skills/` | `delegate_task`; `/slash` | **`cronjob`** tool | ✅ |

**Takeaways:** (1) `AGENTS.md` = one file, ~universal instructions coverage. (2) `SKILL.md` folders =
near-universal skills coverage (8/10; Aider + Continue have *no* skills system → they get instructions
only). (3) subagents, commands (Gemini = TOML!), and hooks are **genuinely per-agent** → distinct emitters.

## 4. Architecture — core → compiler → adapters

```
skull-core/                      # agent-NEUTRAL source of truth (markdown)
  skills/**/SKILL.md             # the methodologies (already ~portable)
  agents/**/*.md                 # role briefs, neutral prose
  leader/SKULL.md                # the manager, agent-neutral
  registry/tools.json            # the Secret Shop catalog (§5)
        │
        ▼   `skull` CLI  —  detects host agent(s), then emits native config
   ┌───────────────┬───────────────┬───────────────┬───────────────┐
   ▼               ▼               ▼               ▼               ▼
 Claude Code     Cursor          Codex           Hermes          any agent
 .claude/*       .cursor/*       AGENTS.md       ~/.hermes/       AGENTS.md +
 (native)        + AGENTS.md     + .codex/skills + skills/        .agents/skills/
```

**Portability tiers** (set honest expectations per agent):
- **Native** (Claude Code today; Cursor, OpenCode, Codex, Hermes next): full — skills + subagents +
  commands + hooks.
- **Good** (Gemini CLI, Cline, Windsurf): skills + instructions + commands; hooks vary.
- **Basic** (Aider, Continue.dev): `AGENTS.md`/`CONVENTIONS.md` instructions only — the leader's *method*
  ports as prose, but no on-demand skills. Say so; don't pretend parity.

**The `skull` CLI** (small, Node, zero-heavy-deps — Node is guaranteed wherever Claude Code runs):
- `skull init` — detect agent(s) in the repo/machine, compile the neutral core into each one's native files.
- `skull sync` — re-emit after a core update (replaces "re-copy `skills/ agents/ commands/`").
- `skull doctor` — report what's installed, drift, version.
- `skull shop …` — the Secret Shop (§5).
- Keep the **"let your agent set it up"** path too (paste-to-Claude), for people who don't want a CLI.

**Compiler internals:** one emitter per target. Shared: SKILL.md passthrough (strip Claude-only frontmatter
keys per target), `AGENTS.md` generator (leader method → prose). Per-target: subagent emitter, command
emitter (Markdown vs Gemini TOML), hook emitter (Claude `settings.json` / Cursor `hooks.json` / Gemini
`hooks/hooks.json` / … — **no common schema, so hooks are opt-in per adapter**).

## 5. Pillar — the Secret Shop (tool advisor + installer)

Your "suggest tools, and if accepted install them and know them as tools to use." Fits the brand
(*"Welcome to the Secret Shop! Ho ho!"*). The loop: **scan → rank → approve → install → register → use.**

- **Scan** the project for signals: stack, repo size, session length/cost, sends PII to a model?, MCP in
  use?, monorepo?, prod surface?
- **Rank** from the **Tool Registry** (`skull-core/registry/tools.json`) — each entry scored for *this*
  project, with a one-line *why it fits here*.
- **Approve** — you say yes (never silent installs; always permissioned).
- **Install** — run the entry's documented, permissioned `install` command.
- **Register** — write it to **`.skull/tools.json`** (project state). The leader now *knows* it's present.
- **Use** — the leader prefers registered tools: long session → reach for `caveman`; big repo → query
  `graphify`/CodeGraph instead of grepping; PII → route through Presidio first.

**Registry entry schema (draft):**
```json
{
  "id": "graphify",
  "kind": "token-optimizer",            // token-optimizer | code-graph | mcp | retrieval | privacy | tracking | testing
  "what": "Turns the repo into a queryable knowledge graph (tree-sitter AST, no LLM).",
  "helps_when": ["large-repo", "high-read-token-cost", "cross-file-navigation"],
  "impact": { "input_tokens": "-70x on large repos" },
  "install": "uv tool install graphify && graphify install --project",
  "verify": "graphify --version",
  "agents": ["claude-code","cursor","codex","gemini-cli","opencode"],
  "leader_rule": "On a big repo or when read-tokens dominate, query graphify instead of reading whole files.",
  "license": "MIT",
  "source": "https://github.com/Graphify-Labs/graphify"
}
```

**Seed registry (v3.0):** `graphify` (input tokens ↓), `caveman` (output tokens ↓), `RTK` (compress
command/log output), `Context7` (version-correct docs MCP), `CodeGraph`/`Serena` (AST/LSP graph),
`Tokscale` (token cost tracking), `Presidio` (PII redaction — powers `sec-pii`), plus the ecosystem
methodologies already in `docs/ECOSYSTEM.md` (superpowers, gsd). graphify + caveman ship as the flagship
**token-optimization stack** (input + output).

**Hub integration (live discovery).** The Claude Skills Hub API is real and verified:
`GET https://claudeskills.info/api/v1/search?q=<term>&type=skill&sort=stars` → take a `slug` →
`GET /api/v1/items/<slug>` → install from `source.repo`. So `skull shop find <need>` can surface *current*
community skills (14,989 indexed), not a stale hardcoded list — the Shop sells skills too, not just tools.

## 6. Pillar — learn from the archive

The hub aggregates the best public work: Anthropic's 16 official skills, OpenAI's 37 (Codex), Superpowers
(20 techniques), "Everything Claude Code" (86+), UI/UX Pro Max, and document skills (PDF/DOCX/XLSX). Plan:
- **Harvest patterns, credit, don't vendor** (same ethic as `docs/ECOSYSTEM.md`).
- **Fill real gaps.** Candidates SKULL lacks today: a **documents** category (PDF/DOCX/XLSX generation),
  **data/analysis**, and a **research** skill. Prioritize by what Atur's own projects need.
- **Wire the Hub API** into the Shop (§5) for on-demand recommendation.

## 7. Pillar — the manager, hardened

Keep SKULL as *the* manager; make the leader **agent-neutral**:
- Don't assume Claude's `Task` tool — express delegation abstractly ("spawn a worker / delegate"), let each
  adapter map it (Claude Task, Cursor subagents, OpenCode agents, Hermes `delegate_task`).
- Don't assume `.claude/` — read the target's own paths (the CLI knows them).
- Keep the Shop, the map (Sentinel), budget-awareness, and the proactive table — now tool-aware
  (it factors in what's registered in `.skull/tools.json`).

## 8. Roadmap (phased — markdown-first; the CLI comes last, when it's fully ready)

Per the 2026-07-22 steer: **stay pure-markdown for now**; the optional `skull` CLI lands only once it's
solid. Every earlier phase is plain files you copy — no CLI required.

- **Phase 0 — Plan & face.** This RFC + a better pixel-skull logo (Fable). ✅ *shipped 2026-07-22 (`d4e907f`)*
- **Phase 1 — Universal instructions (fast, low-risk, pure markdown).** ✅ *shipped 2026-07-22.* The portable
  leader lives at `adapters/universal/AGENTS.md` (the SKULL method, agent-neutral) + `adapters/README.md`
  (the per-agent install matrix + the `cp skills/ → .agents/skills/` step). Readable by every AGENTS.md agent.
- **Phase 2 — Static per-agent adapter folders (pure markdown).** ✅ *shipped 2026-07-22.* `adapters/cursor/`
  (native `.cursor/rules/skull.mdc` + skills), `adapters/codex/` (`AGENTS.md` + `.codex/skills/` + config),
  `adapters/hermes/` (`AGENTS.md` + `MEMORY.md` seed + cron examples) — pre-generated native files the user
  copies into place. No compiler yet; just the right files per agent.
- **Phase 3 — The Secret Shop, leader-driven (markdown).** ✅ *shipped 2026-07-22.* New skill
  `skills/orchestration/secret-shop/` — `SKILL.md` (scan → recommend → record → use loop) + `registry.json`
  (8 seeded tools: graphify, caveman, Context7, CodeGraph, Serena, RTK, Tokscale, Presidio, each with exact
  install/verify + a `leader_rule` + the live Hub API). Wired into the leader (category table + proactive
  row) + `/skull:shop` command. Records installs to `.skull/tools.json`. (Registry is skill-local for
  copy-portability, not top-level; auto-install is a CLI job — Phase 5.)
- **Phase 4 — Archive harvest.** ✅ *shipped 2026-07-22.* Added the `documents/` category (`doc-pdf`,
  `doc-office`) — the clearest gap vs the archive — wired into the leader (category table + proactive row).
  The Hub search API is live in the Secret Shop (registry `hub` + the skill's Live-discovery section) so it
  recommends current community skills on demand. Sources credited (not vendored) in `docs/ECOSYSTEM.md`.
- **Phase 5 — The `skull` CLI (only when fully ready).** Automates it all: `init`/`sync`/`doctor` compile the
  neutral core into any agent, and `skull shop install` runs the permissioned installs. Then bump
  `plugin.json`, rewrite the README around "universal + Shop", update `ECOSYSTEM.md`/`ADDING-A-CAPABILITY.md`,
  tag **`v3.0.0`**, blog post.

Each phase is independently shippable — no big-bang release, and v3 is "done enough to use" well before the CLI.

## 9. Decisions (locked 2026-07-22)

1. **Cross-agent targets.** Universal `AGENTS.md` layer **first** (covers *all* agents for instructions),
   then native adapters for **Cursor → Codex CLI → Hermes**. Open to more later — the universal layer already
   reaches every agent that reads AGENTS.md, so "works with the others" is true from Phase 1.
2. **Markdown-first; CLI later.** Stay **pure markdown** for now. The `skull` CLI is deferred to Phase 5 and
   ships only when it's fully ready. Consequence: cross-agent setup is copy-the-right-folder (Phase 2), and
   the Shop *recommends + you run the command* (Phase 3) until the CLI can auto-install. This preserves the
   "inert markdown, runs nothing" promise for the whole pre-CLI period.
3. **Repo shape.** One repo: `skull-core/` (neutral) + `adapters/<agent>/` (static, Phase 2) + `cli/` (Phase 5).
4. **Shop installs.** Only the eventual CLI runs installs, and always permissioned/explicit — never silent.
   Documented as opt-in in SECURITY.md when it lands.

## 10. Success criteria & non-goals

**Done when:** `skull init` produces a working setup in ≥3 agents from one source; `skull shop` installs +
registers a tool and the leader then uses it; the neutral core stays the single source (no per-agent content
forks); README/plugin/docs updated; `v3.0.0` tagged.

**Non-goals:** no hosted service, no account, no telemetry, no vendoring other people's skill files, no
autonomous runners. The markdown path stays inert-by-default; only the opt-in CLI/Shop runs anything.

---

*Companion research (per-agent formats, AGENTS.md, SKILL.md adoption, the Hub API, graphify/caveman) is the
July 2026 survey summarized in §3. Update this RFC as phases land.*

# MASTER CLAUDE — ecosystem & references

MASTER CLAUDE stands on the shoulders of the open Claude Code community. We **don't vendor other people's
skills** into this repo — instead we learn from the best public work, build our own original skills, and
point you at the originals so you can install them too. Everything below is **MIT-licensed** and worth
running alongside MASTER CLAUDE. The leader knows these and will recommend the right one when it fits.

## Recommended to install alongside MASTER CLAUDE
| Project | By | What it gives you | We learned… |
|---|---|---|---|
| **[superpowers](https://github.com/obra/superpowers)** | Jesse Vincent (`obra`) | A deep skills framework + methodology: brainstorming, plan-writing, **subagent-driven development**, **parallel-agent dispatch**, git-worktree isolation, strict TDD, systematic debugging, and a meta-skill for writing skills. | model-per-role ("turn count beats token price"), the two-loop reviewer, parallel-dispatch-by-cardinality, and trigger-only skill descriptions → shaped our `orchestration/` skills. |
| **[mattpocock/skills](https://github.com/mattpocock/skills)** | Matt Pocock | "Skills for real engineers" — the original viral **`grill-me`** interview skill, plus `to-prd`, `to-issues`, domain-modeling, TDD, handoff, and more. | one-question-at-a-time **with a recommended default**, codebase-grounded interviewing, depth-first decision-tree traversal, and interview→spec handoff → sharpened our `grill-me`. |
| **[Jekudy/grillme-skill](https://github.com/Jekudy/grillme-skill)** | Jekudy | An independent Socratic deep-interview skill that escalates in **waves** (basics → edge cases → contradictions/blind-spots). | wave-based question escalation → added to our `grill-me`. |
| **[gsd](https://github.com/glittercowboy/gsd)** | — | Spec-driven autonomous builds that resume across `/compact`. | a model for long autonomous, spec-driven builds. |
| **caveman** | — | Terse output mode (~65% fewer output tokens) for long sessions. | when to recommend trimming output on marathon sessions. |

> If you heard about MASTER CLAUDE alongside a Persian "**Kak [Alireza]**" recommendation, that most likely
> points to [Alireza Rezvani's skills aggregator](https://github.com/alirezarezvani/claude-skills), which
> **re-hosts** Matt Pocock's `grill-me` — the canonical upstream is `mattpocock/skills` above.

## Privacy / PII (what `sec-pii` builds on)
- **[Microsoft Presidio](https://github.com/microsoft/presidio)** (MIT) — detect + de-identify PII: an
  **analyzer** + **anonymizer** + **image/DICOM redactor**; mask / redact / hash / encrypt; built-in + custom
  recognizers; Python / Docker / Kubernetes / PySpark. The engine behind our `sec-pii` skill — run it as a
  redaction gateway *before* user data reaches a model, a log, or a third party.

## Context-engineering power-ups (stop burning tokens)
Tools the **context-engineering** skill points at (credit: the "15 ways to stop burning tokens" playbook by
**devwithmj** on Medium). Re-implement the discipline; install these where they fit:
- **[Context7](https://github.com/upstash/context7)** (Upstash) — an MCP that fetches **version-correct library
  docs at query time**, so you stop pasting stale docs and hallucinating APIs.
- **[CodeGraph](https://github.com/colbymchenry/codegraph)** — a pre-indexed **code knowledge graph** over MCP
  (semantic queries instead of grep/Read crawls). Complements our zero-dependency `repo-map`.
- **[RTK](https://github.com/rtk-ai/rtk)** (Apache-2.0) — a CLI proxy that **compresses command / log output**
  (60–90% fewer tokens) before it reaches the model; installs as a PreToolUse hook.
- **[Tokscale](https://github.com/junhoyeo/tokscale)** — **track token usage** across your agents like an infra
  cost (per model / day / session). Pairs with `model-router` + `token-economy`.

## Parallel sessions (built into Claude Code — what `fleet` uses)
The **fleet** skill orchestrates these native Claude Code primitives (no extra install) to run the team across
separate parallel sessions for throughput:
- **[Background agents](https://code.claude.com/docs/en/agent-view)** — `claude --bg` runs a chunk in its own
  full session + auto git-worktree; monitor with `claude agents` / `claude logs`. The recommended way to fan out.
- **[Agent teams](https://code.claude.com/docs/en/agent-teams)** (experimental) — teammates with a shared task
  list + mailbox, for work that needs coordination.
- **[Git worktrees](https://code.claude.com/docs/en/worktrees)** — isolate parallel file edits.

The trade-off is real: **N parallel sessions ≈ N× usage** — fan out only for genuinely independent work.

## Codebase graph / repo-map (optional MCP power-ups)
MASTER CLAUDE ships a zero-dependency **`repo-map`** skill (a ranked structure map via Grep/Glob) plus
**Sentinel** (the architectural map). For a *true* AST/LSP code graph — symbol-level retrieval, real
call/impact edges, incremental sync — you need an MCP server (beyond plain markdown). Good ones to run
alongside:
- **[Aider's repository map](https://aider.chat/docs/repomap.html)** — the original tree-sitter + PageRank
  ranked map (built into Aider; the concept our `repo-map` approximates).
- **[code-graph-mcp](https://github.com/sdsrss/code-graph-mcp)** / **[CodeGraph](https://github.com/colbymchenry/codegraph)**
  — a local AST graph (call graph, impact analysis, dead-code) exposed to Claude Code over MCP.
- **[Serena](https://github.com/oraios/serena)** — LSP-powered symbol-level navigation and edits.

The leader points you here when a project is big enough that grep-and-read gets expensive.

## Frontend / UI design (what the `frontend/` skills build on)
The `skills/frontend/` pack produces good UI by reaching for the best of what Claude and the community already
offer — credited, not vendored:
- **Claude's own output channels** — **artifacts** (live React/HTML), the **visualize `show_widget`** (inline
  SVG/HTML), and the Anthropic design skills: **canvas-design** (posters / static art), **theme-factory** (apply
  a theme), **brand-guidelines** (brand colors + type), **algorithmic-art** (generative).
- **Component systems** — **[shadcn/ui](https://ui.shadcn.com)**, **[Radix Primitives](https://www.radix-ui.com)**
  (accessible, unstyled), **[Tailwind CSS](https://tailwindcss.com)** — the conventions `fe-design-system` and
  `fe-component-craft` reuse.
- **Standards** — the **[WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)** and
  **[WCAG](https://www.w3.org/WAI/standards-guidelines/wcag/)** for the accessibility + contrast rules
  `fe-component-craft` and `fe-design-review` enforce.

## Primary sources we build from
- Anthropic — [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Anthropic — [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- Claude Code docs — [subagents](https://code.claude.com/docs/en/sub-agents) · [agent teams](https://code.claude.com/docs/en/agent-teams) · [best practices](https://code.claude.com/docs/en/best-practices)
- Curated lists — [awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) · [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)

## How MASTER CLAUDE relates to these
- **MASTER CLAUDE is the leader.** It assembles a tailored team for *your* project and runs it. When an
  external tool fits better than anything in our archive, the leader recommends it (never silently forces it).
- **Our skills are original.** Where a technique came from a project above, we credit it in that skill's
  footer — we re-implemented the *idea*, not their files.
- **Licensing.** MASTER CLAUDE is MIT. The projects above are MIT. If you fork, keep each project's own
  license + attribution.

*Know a great public skill we should learn from or recommend? Open a PR adding it here.*

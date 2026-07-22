---
name: model-router
description: >-
  How SKULL picks the right model for each agent and task. Triggers on "which model", "pick a
  model", "model selection", "use haiku/sonnet/opus", "cheaper model", "model per agent", or whenever
  spawning a subagent/team and choosing its model, or optimizing cost vs. quality on a long run. Gives a
  role→model heuristic, the "turn count beats token price" rule, the effort dial, and the cost math so the
  team is both strong where it matters and cheap where it doesn't.
allowed-tools: Read, Grep, Glob, Bash, Task
---

# Model router — the right model for each agent

Multi-agent quality comes mostly from spending tokens across parallel contexts — so spend them **where they
matter** and save them everywhere else. Set a model per subagent (the `model` field / the Task `model`
option): `opus` · `sonnet` · `haiku` · `fable` · a full id · or `inherit` (default).

## Role → model
| Role / task character | Model | Why |
|---|---|---|
| **Lead / orchestrator**, synthesis, architecture, ambiguous hard reasoning | **Opus** | Control-logic quality drives the whole run |
| **Implementation**, refactors, writing tests, most production coding, most reviews | **Sonnet** | Best capability/cost balance — the production default |
| **Search / discovery**, grep-and-summarize, mechanical transforms, log triage | **Haiku** | ~5× cheaper input than Opus; quality gap negligible on non-reasoning work |
| **Security-critical or final whole-branch review** | **Opus** | Worth the spend at the gate |
| **Sub-task that needs your full context** | **`inherit`** / fork | Keeps continuity; a fork reuses the prompt cache (cheaper) |

## The rule that decides the close calls
**Turn count beats token price.** A weak model that retries five times costs more — in tokens *and*
wall-clock — than a stronger fast model that nails it once. When unsure between two tiers for real work,
pick the stronger one; only drop to Haiku for genuinely mechanical tasks.

**Two rules that stop silent overspend:**
- **Least powerful that suffices.** Default a role *down* to the cheapest tier that can actually do it — the
  turn-count rule overrides only for genuine reasoning work. (One axis decides up, the other down.)
- **Always set the model on a dispatch.** An omitted model inherits the *session* default (often Opus) — so
  a grunt task silently runs on the priciest tier, **defeating the whole point of routing**. Name the model every time.
- **Implementation tier by signal:** 1–2 files + a complete spec → cheapest; multi-file / integration → mid;
  design judgment or broad-codebase reasoning → top. Never drop a **reviewer** (or an implementer working
  from prose, not a precise spec) below the mid tier.

## Also dial `effort`
Independently of the model, set reasoning **effort** per subagent (`low`/`medium`/`high`/`xhigh`/`max`).
Use `low` for cheap mechanical stages; reserve `high`+ for the hardest verify/judge/synthesis stages.
Cheap model **and** low effort for the grunt work; strong model **and** high effort for the crux.

## Cost anchors (per MTok, input/output)
Opus 4.8 **$5 / $25** · Sonnet 4.6 **$3 / $15** · Haiku 4.5 **$1 / $5**. So Haiku input is ~5× cheaper than
Opus, Sonnet ~1.7× cheaper. A common, strong shape: **Opus lead + Sonnet workers + Haiku scouts.**

## Defaults & cautions
- Don't override the model without a reason — `inherit` is right more often than not.
- The built-in **Explore** subagent already runs on a fast model and is read-only — prefer it for
  "where is X / how does Y work" instead of spinning up a custom researcher.
- Match `effort` and model together; a max-effort Haiku on a reasoning task is a false economy.

---
*Credits / further reading:* Anthropic [pricing](https://platform.claude.com/docs/en/about-claude/pricing)
& [subagents docs](https://code.claude.com/docs/en/sub-agents); the "model-per-role / turn-count-beats-price"
framing is crisp in **superpowers** (`obra/superpowers`, MIT). See `docs/ECOSYSTEM.md`. Pair with
**subagent-orchestration**.

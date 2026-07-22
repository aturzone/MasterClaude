---
name: context-engineering
description: >-
  Curate the model's context window for the most signal per token — stop burning tokens on bloat. Triggers on
  "context engineering", "burning tokens", "context window full", "reduce token usage", "the model lost the
  thread", "too much in context", "prompt caching", "session handoff", or any long / expensive session. The
  discipline of deciding what goes in the window (and what doesn't): cache-stable instructions, retrieve don't
  dump, fresh docs at query time, audit your MCPs, compress tool output, and measure tokens like an infra cost.
allowed-tools: Read, Grep, Glob, Bash
---

# Context engineering — the window is a budget, spend it well

Every token in the context window costs money, latency, and *attention* (more noise = worse answers). Context
engineering is deciding, deliberately, **what earns a place in the window** — and routing the rest elsewhere.

## The disciplines
1. **Keep instructions small and prefix-stable.** A lean `CLAUDE.md` / system prompt beats a kitchen sink.
   **Prompt caching** rewards a *stable prefix*: put the unchanging stuff first and don't reorder it — a change
   near the top invalidates the cache for everything after it. (Pairs with **workspace-architect**.)
2. **Retrieve, don't dump.** Pull the few relevant files / snippets; never paste a whole repo or doc. Use a
   ranked map (**repo-map**) or a code graph (CodeGraph) to find the load-bearing few. (Pairs with **repo-map**.)
3. **Fresh docs at query time, not pasted.** Stale pasted docs cause hallucinated APIs; fetch version-correct
   docs on demand with a docs MCP (**Context7**) instead.
4. **Compress tool output before it lands.** Logs, `git status`, test output, `find` — pipe them through a
   compressor (**RTK**) or summarize before feeding them in; raw command spew is the quiet token killer.
5. **Audit your MCP servers.** Every connected MCP injects its tool definitions into *every* request. Keep only
   the ones this project uses — each unused server is a permanent context tax.
6. **Stop documentation inflation.** Instruction files grow unbounded if you let them. Trim ruthlessly; link to
   detail instead of inlining it; one fact in one place.
7. **Hand off cleanly across sessions.** For long work, take a clean break with a short handoff note so the next
   session restarts from a compact summary, not a giant transcript. (Pairs with **compactor**.)
8. **Measure tokens like an infra cost.** Right-size the model per task (**model-router** — Haiku scouts, Opus
   for the hard calls), trim output (**caveman** / **token-economy**), and watch usage (Tokscale) instead of
   guessing. What you don't measure, you overspend.

## The quick audit
Run it when a session feels expensive or the model is losing the thread:
- What's in the window that isn't earning its tokens? (a bloated `CLAUDE.md`, pasted docs, raw logs, unused MCPs)
- Could a retrieval step replace a dump? Could a cheaper model do this turn? Is the prefix stable enough to cache?
- Fix the biggest leak first; re-measure. Treat it like profiling, not vibes.

## Where SKULL already helps
**token-economy** (best output per token), **repo-map** (ranked retrieval), **compactor** (session handoffs),
**model-router** (right model per task), **workspace-architect** (a lean `.claude/`). The external power-ups —
Context7, CodeGraph, RTK, Tokscale, caveman — are in **docs/ECOSYSTEM.md**.

---
*Credits: the "15 ways to stop burning tokens" context-engineering playbook (devwithmj on Medium). We
re-implement the ideas and point you at the tools. See docs/ECOSYSTEM.md.*

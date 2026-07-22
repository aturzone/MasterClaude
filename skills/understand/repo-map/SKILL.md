---
name: repo-map
description: >-
  Build a ranked, token-budgeted map of the codebase — the top files and their key symbols, ranked by how
  referenced they are — so you navigate to the right 3 files instead of reading 30. Triggers on "map the
  repo", "where is X", "how is this codebase laid out", "lay of the land", "I'm new to this repo", or at the
  start of work in a large/unfamiliar project. A zero-dependency repo-map (Glob + Grep + reference counts)
  that approximates a code graph; complements Sentinel's architectural map and saves tokens.
allowed-tools: Read, Grep, Glob, Bash
---

# Repo map — a ranked, token-cheap guide to the code

In a big or unfamiliar repo, reading files blindly burns tokens and misses the point. Build a **ranked map**
once — the files that matter, with their key symbols — then use it to jump straight to the right places.
This is the "repository map" idea: a *computed, importance-ranked* structure, not a flat file list.

## Build it
1. **Structure** — `git ls-files` (respects `.gitignore`); drop vendored/build/binary. Note the dir shape.
2. **Symbols** — `Grep -n` for definitions per language: `^(export )?(async )?function`, `^(class|interface|
   type|enum)`, `^\s*def `, `^func `, route decorators, etc. Capture name + signature + `path:line`.
3. **Rank by inbound references (a centrality proxy).** For each symbol, count how often its name appears
   repo-wide (`grep -row '\bNAME\b' | wc -l`) — most-referenced ≈ most load-bearing. This approximates the
   PageRank a tree-sitter graph would compute. *(Honest limit: common/overloaded names over-count, and this
   is text matching, not a real call graph — refine a hot path with a targeted grep before trusting it.)*
4. **Emit a budgeted map** to `.skull/repomap.md`: the top files (by ranked symbols), each with its
   highest-ranked signatures + a reference count, plus entry points (`main`/`index`/routes) and the dir
   shape. Keep it to a **token budget** (~1–2k) — it's a guide, not a dump.

## Use it
- **Navigate, don't trawl.** Consult the map to pick the *few* files to actually read for the task — that's
  the token win (pairs with **token-economy**).
- **Rough impact check.** A symbol's inbound count + where it's referenced is a cheap "what depends on this?"
  — confirm with a targeted `grep` before a risky change.
- **Refresh incrementally.** Re-run only over `git diff --name-only <lastmap>..HEAD`; don't rebuild the world.

## Complements, doesn't replace
- **Sentinel** keeps the *architectural* map (modules, entry points, data-flow, invariants, findings) — the
  narrative layer. Repo-map is the *mechanical* layer (ranked symbols + reference counts). Use both: Sentinel
  for "how it's designed", repo-map for "where the load-bearing code is".
- **Want a true AST/LSP graph** (real call edges, impact analysis, symbol retrieval)? That needs an MCP
  server — beyond plain markdown. See `docs/ECOSYSTEM.md` for Aider's repo-map, code-graph-mcp, CodeGraph,
  and Serena, and the leader will point you there once a repo is big enough that grep-and-read gets expensive.

---
*Credits / further reading:* the ranked "repository map" concept is from **Aider** (tree-sitter + PageRank
over the symbol graph). See `docs/ECOSYSTEM.md`. Pairs with **Sentinel** + **token-economy**.

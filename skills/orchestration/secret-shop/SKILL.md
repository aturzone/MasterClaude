---
name: secret-shop
description: >-
  SKULL's tool advisor — "Welcome to the Secret Shop! Ho ho!" Scans the project and recommends the right
  EXTERNAL third-party tools for THIS codebase: graphify + caveman for token economy, Context7 / CodeGraph /
  Serena for big-repo retrieval, RTK for log compression, Tokscale for cost tracking, Presidio for PII. It
  hands you the exact install command, records what you install to `.skull/tools.json`, and then prefers
  those tools in later work. Triggers on "recommend tools", "what tools should I use", "the secret shop",
  "set up my tooling", "this is getting expensive / token cost", "big repo is slow to navigate", "we send
  user data to a model", or when a project signal matches a registered tool. Reads `registry.json`. Never
  auto-installs — it recommends and lets you run the command; installs stay permissioned and explicit.
allowed-tools: Read, Grep, Glob, Bash, WebFetch, WebSearch
---

# The Secret Shop — recommend the right tools, then use them

*"Welcome to the Secret Shop! Ho ho!"*

SKULL is the manager; the Secret Shop is where it stocks the project with **external** tools it doesn't ship
itself. The loop is **scan → recommend → (you approve) → install → record → use.** You never install
silently — you surface the right tool for *this* project, hand over the exact command, and let the user run
it. Once installed, you *remember* it and reach for it.

## What's in stock
The catalog is **`registry.json`** (next to this file). Each entry says what a tool does, when it helps, the
exact `install`/`verify` commands, which agents it supports, and a `leader_rule` — how SKULL should use it
once present. Read the registry; don't recite tools from memory. Today's staples:

| Tool | Cuts | Reach for it when |
|---|---|---|
| **graphify** | input/read tokens (~70×) | a big repo where reading files dominates the cost |
| **caveman** | output tokens (~65%) | a long, output-heavy session (skip on terse/reasoning-heavy work) |
| **Context7** | hallucinated APIs | writing against a library/framework — pull version-correct docs |
| **CodeGraph / Serena** | input/read tokens | symbol-level nav, call/impact, refactors on a large codebase |
| **RTK** | noisy tool/log output (60–90%) | test runners / logs flooding the context |
| **Tokscale** | blind spend | a budget is set or cost matters — track the burn |
| **Presidio** | PII leakage | user data (names, emails, IDs, cards, medical) heads to a model/log/3rd party |

graphify + caveman are the flagship **token-economy pair** — graphify trims what you *read*, caveman trims
what you *write*. Recommend them together on a big repo running long.

## Step 1 — scan this project for signals
Cheaply, before recommending. Look for:
- **Size / navigation cost** — file count, LOC, monorepo? (big ⇒ graphify / CodeGraph / Serena)
- **Token / cost pressure** — long session, a `+budget` directive, output volume? (⇒ caveman, RTK, Tokscale)
- **Library surface** — heavy framework/SDK use, version-sensitive APIs? (⇒ Context7)
- **PII exposure** — does code send user data (names, emails, IDs, cards, health) to a model, a log, or a
  third party? (⇒ Presidio, and the `sec-pii` skill)
- **Already-installed** — read `.skull/tools.json` first; don't re-recommend what's there.

Match signals to `registry.json` entries by their `helps_when` tags. Recommend the **few** that clearly fit
— not the whole shelf.

## Step 2 — recommend (never force)
For each pick, one tight line: *what it is · why it fits **here** · the exact install command · the caveat if
any* (e.g. caveman can go net-negative on terse work). Lead with the single highest-leverage tool. If the
project already has a richer tool for the job, say so and don't push a duplicate.

## Step 3 — install is the user's, explicitly
Show the `install` command; let the user run it (or run it **only** on an explicit yes, under the normal
permission prompt — never as a silent side effect, never a permission-skipping flag). External installs are
opt-in by definition. After it lands, run the entry's `verify`.

## Step 4 — record it
Write what's installed to **`.skull/tools.json`** so the knowledge survives compaction and future sessions:
```json
{ "installed": [
  { "id": "graphify", "installed_at": "<date>", "verify": "graphify --version", "note": "big repo" }
] }
```
Keep it in sync — drop an entry if the user removes a tool.

## Step 5 — use what's installed
This is the point. For every tool in `.skull/tools.json`, honor its `leader_rule`: on a big repo, query
**graphify** instead of reading whole files; on a long output-heavy run, lean on **caveman**; before user
data reaches a model, route it through **Presidio**. A tool you recommended but never use is wasted advice.

## Live discovery — the wider shelf
The registry is a curated core, not the whole world. For a need it doesn't cover, query the **Claude Skills
Hub** (see `registry.json` → `hub`): `GET https://claudeskills.info/api/v1/search?q=<need>&type=skill&sort=stars`,
then `GET /items/<slug>` for detail, and read the tool's **source repo before recommending it**. Same rules:
recommend, show the install, let the user run it. Never auto-install from the hub.

## Safety
- **Recommend, don't force. Install only on an explicit yes. Never silently.** External tools run code and
  make network calls — that's the user's decision, every time.
- Prefer well-licensed, open, auditable tools (the registry tracks `license` + `source`). Skip anything you
  can't point at a real upstream for.
- The Shop suggests *tools*; it never weakens SKULL's own rails (no moving money, destroying data, or
  exfiltration; production stays advisor-only).

---
*Credits:* the token-economy pair **graphify** + **caveman**, plus Context7, CodeGraph, Serena, RTK,
Tokscale and Presidio — all credited with their upstreams in `registry.json` and `docs/ECOSYSTEM.md`. Pairs
with **token-economy**, **context-engineering**, **model-router**, and **sec-pii**.

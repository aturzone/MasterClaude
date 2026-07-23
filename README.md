<h1>
  <img src=".github/skull-logo.svg" alt="Skull" width="100" align="center" />&nbsp; SKULL
</h1>

**A free, open-source Claude Code team.** Say **"skull"** and a *leader* interviews you, maps your
project, and assembles a tailored team — **Sentinel** the project cartographer plus planning, review,
understanding and guardrail specialists — then runs it on your work. It also keeps itself (and you) current
with the newest Claude Code features.

No account. No API key. No vault. It's just markdown you drop into `.claude/` — everything is local, plain text, and open.

**Safe by default.** Adding SKULL runs **nothing** — it's inert markdown. There are **no** autonomous
runners and no background daemons; every capability works interactively under Claude
Code's normal permission prompts, nothing auto-starts, and no data leaves your machine. Its guardrails are
guidance by default; a few can be **armed** as opt-in `PreToolUse` hooks that hard-block the riskiest moves
(weakening a test, irreversible shell on a prod box) — off until you switch them on: **[docs/ENFORCEMENT.md](docs/ENFORCEMENT.md)**.
Full model: **[SECURITY.md](SECURITY.md)**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Buy me a coffee in TON](https://img.shields.io/badge/Buy%20me%20a%20coffee-TON-0098EA.svg)](https://skull.shop/donate)

---

## What it is
SKULL is a set of Claude Code **skills** and **agents** — all plain `.md` files, organized by
category — plus a **leader** skill (`skull`) that ties them together. You add the markdown to your
project's `.claude/` folder (or your global `~/.claude/`) and it's live. Instead of installing a dozen tools
you'll forget, you say "skull" once — it figures out what
*this* project and *this* developer need, assembles the smallest team that helps, gets to work, and brings
in more members the moment a need shows up.

## Requirements
**Claude Code ≥ 2.1.183** (the categorized skill folders rely on nested-skill discovery). Check with
`claude --version`; if you're behind, run `claude update`.

## Set up
SKULL is `.md` files you drop into `.claude/`. Pick either path:

**A. Let Claude Code set it up (easiest).** In your project, paste this to Claude Code:

> I want to use SKULL (https://github.com/aturzone/Skull) in this project. Clone the repo,
> copy its `skills/`, `agents/` and `commands/` folders into this project's `.claude/` directory, then load
> and run the `skull` skill to set up my team.

**B. Manual (git).**
```bash
git clone https://github.com/aturzone/Skull /tmp/mc
mkdir -p .claude && cp -r /tmp/mc/skills /tmp/mc/agents /tmp/mc/commands .claude/
```
Use `~/.claude/` instead of `.claude/` to enable it for **every** project. The optional Sentinel hook and
full details are in **[SETUP.md](SETUP.md)**.

**Then run it** — in any project, say:
```
skull — set up my team for this project
```
(or `/skull`). It interviews you, maps the repo, and assembles your team. See your team any time
with `/skull-team`.

## The team
The leader picks a **minimal** subset per project — never all at once. Capabilities are organized by
category; each folder has a README that brainstorms what else belongs there (good first contributions).

- **`agents/`** — **Sentinel** (project cartographer → `.sentinel/`), the **Security Auditor** (read-only
  vulnerability audit → `.security/`), the **Tester** (QA lead → `.skull/qa/` + `skull.html`) and the **Designer**
  (design lead → `.skull/design/` + `skull.html`). All read-only toward your source.
- **`skills/planning/`** — `grill-me` · `cap-brainstorm` · `cap-plan-first` · `cap-spec-smith` ·
  `cap-decomposer` · `cap-write-plan` · `cap-execute-plan` — fuzzy ask → spec → plan → built result.
- **`skills/review/`** — `cap-self-review` · `cap-red-team` — critique the diff and the design.
- **`skills/understand/`** — `cap-explain-senior` · `cap-rubber-duck` · `codehistorian` · `repo-map`
  (a ranked code map for token-cheap navigation) — explain, debug, trace history, map the codebase.
- **`skills/guardrails/`** (the Guardian suite) — `guardian` · `supplyguard` · `testmedic` · `cap-tdd` ·
  `debtradar` · `compactor` · `guardian-suite` — keep the work honest and the codebase healthy.
- **`skills/frontend/`** (the design team) — **`ui-intel`** (a queryable design-intelligence database: real hex
  palettes, styles, font pairings, decision rules and anti-patterns per product type — contrast **verified**, not
  claimed; persists to `.skull/design/MASTER.md` so every session builds the same product) · `ux-research` ·
  `fe-design-system` · `fe-page-patterns` · `fe-component-craft` · `fe-from-reference` · `fe-a11y` (WCAG 2.2 AA) ·
  `fe-motion` · `fe-perf` (LCP/CLS/INP) · `fe-design-review` — UI that looks designed, not default.
- **`skills/security/`** — `sec-authz-review` · `sec-attacker-review` · `sec-injection` · `sec-authn-session` ·
  `sec-secrets-crypto` · `sec-ssrf-traversal` (+ depth: frontend / api / deps / iac-cloud / threat-model /
  headers) · `sec-pii` (anonymize user PII before it reaches a model) — review for vulnerabilities + privacy,
  front→back (OWASP/CWE, with fixes).
- **`skills/workflows/`** — `wf-codebase-audit`, `wf-security-audit`, `wf-ui-uplift` (a full design pass:
  brief → system → layout → build → a11y-first review) — big, multi-step jobs.
- **`skills/operate/`** — `ops-env-map` (know where you are — unprovable ⇒ production) · `ops-ship` (the
  5-slot deploy gate) · `ops-incident` (stabilize → diagnose) · `ops-rollback` (incl. expand/contract
  migrations) · `ops-observe` · `ops-postmortem` (blameless) — the production half; on prod, an advisor with
  read access, never an actor.
- **`skills/testing/`** — `wf-tester` (a full QA pass → `skull.html`) · `test-user-end` · `test-blackbox` ·
  `test-code` · `test-stress` (load/soak via k6) · `skull-dashboard` — the tester team on any project, safe
  by default.
- **`skills/orchestration/`** — `subagent-orchestration` (delegate to subagents/teams) · `model-router`
  (pick a model per agent — Opus lead / Sonnet workers / Haiku scouts) · `token-economy` (best output per
  token — caveman, cheaper models, cache-warm) · `context-engineering` (curate the window — cache-stable,
  retrieve-don't-dump, audit MCPs, measure tokens) · `fleet` (run the team in separate parallel sessions for
  throughput — cost-capped, opt-in) · `workspace-architect` (the best `.claude/` setup per
  project) · `worktree-isolation` (parallel work without collisions) · `secret-shop` (scan the project →
  recommend the right *external* tools → record to `.skull/tools.json` → use them).
- **`skills/documents/`** — `doc-pdf` (create/fill/extract PDFs) · `doc-office` (Word/Excel/PowerPoint) —
  when the deliverable is a file a human opens, not code.
- **`skills/meta/`** — `writing-skills` (author or sharpen a SKULL skill) · `statusline-designer`
  (design a custom Claude Code status line for CLI users — gated, opt-in) — so the archive keeps growing.

## How it works
1. **Interview (grill-me).** Developer → want → purpose → project → environment — one sharp question at a
   time, each with a recommended default. It explores the repo first and never asks what the code answers.
2. **Map.** Detects your stack and the gaps for *this* goal.
3. **Assemble.** Picks a tailored team from the installed skills and explains why each fits.
4. **Run.** Actually does the work with the team, and tells you what each member changed.

## Staying up to date
SKULL keeps itself current — it's your guide to the best of Claude Code. Ask it **"what's new"**
(or run `/skull:whats-new`) and it checks your Claude Code version, reads the official changelog,
and flags the new features relevant to *your* work.
- **Update SKULL:** just ask it to **"update yourself"** — it `git pull`s the repo and re-copies
  `skills/ agents/ commands/` into `.claude/`. (Or do it by hand, same two commands as setup.)
- **Update Claude Code:** `claude update`.

## Sentinel — the cartographer
Sentinel holds your whole repo as a living map and keeps it honest: every module, entry point, and
invariant recorded; every gap / bug / missing test surfaced as a tracked, cross-linked finding. It is
**read-only toward your source** — it only ever writes under `.sentinel/`.
- `/sentinel:map` — build (or rebuild) the full map and initial findings.
- `/sentinel:sweep` — review what changed since the last run.
- `/sentinel:report` — show the current map + open findings.

A session hook nudges you when the map drifts behind HEAD or criticals are open.

## Customization
Drop a `.claude/skull.json` in your project to steer the leader (all keys optional):
```json
{
  "autonomy": "ask",
  "verbosity": "normal",
  "defaultGuardrails": ["guardian", "sentinel"],
  "preferredEcosystem": ["superpowers"],
  "offProactive": false
}
```

## Plays nicely with the wider ecosystem
SKULL will recommend (never force) external tools when they fit: **[superpowers](https://github.com/obra/superpowers)**
(broad TDD/review + subagent base), **[mattpocock/skills](https://github.com/mattpocock/skills)** (the
original `grill-me` + engineering skills), **gsd** (spec-driven autonomous builds), **caveman** (fewer output
tokens on long sessions). We learn from the best of the community and build our own — we **don't vendor their
files**; we credit them and point you upstream. The full list + what each taught us is in
**[docs/ECOSYSTEM.md](docs/ECOSYSTEM.md)**.

## Contributing
This is a community project — PRs welcome. Add or sharpen a skill, an agent, or a workflow; each category
folder brainstorms what's needed (including **stack-specific** ideas). Contributors who want it can share a
**TON address with their PRs** and receive a slice of the month's donations (see below). Start here:
[CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).


## Support the project ☕
SKULL is free and open source. If it saves you time, **buy it a coffee in TON** — 100% on-chain,
wallet-to-wallet, no accounts or cards, and you can leave a message with your donation:
<https://skull.shop/donate>

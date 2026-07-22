# Contributing to SKULL

Thanks for helping build SKULL — a free, open-source Claude Code team. It's a collection of
**skills**, **agents**, and a **leader** that assembles them for your project. Everything here is plain
text: no build step, no secrets, no accounts.

This is a community project. Our first focus is **a clean, well-organized structure** so that anyone who
installs Claude Code gets a ready-made, guided setup from day one — and so the library scales across many
tools and many **tech stacks**.

## Requirements
Claude Code **≥ 2.1.183** (the categorized skill folders use nested-skill discovery). Check with
`claude --version`; run `claude update` if you're behind.

## Repo layout
SKULL is plain markdown. The three folders users copy into their `.claude/` are `skills/`,
`agents/`, and `commands/`:
```
skills/
  skull/SKILL.md     # the leader (entry point)
  planning/   <skill>/SKILL.md   # spec & plan before code
  review/     <skill>/SKILL.md   # critique the diff & design
  understand/ <skill>/SKILL.md   # explain, debug, trace history
  guardrails/ <skill>/SKILL.md   # keep the work honest & healthy (the Guardian suite)
  security/   <skill>/SKILL.md   # review for vulnerabilities, front→back (OWASP/CWE)
  workflows/  <skill>/SKILL.md   # big multi-step jobs
agents/<name>.md             # subagents (Sentinel; security-auditor) — may nest in agents/<category>/
commands/                    # slash commands (/skull:whats-new, /skull:security, /sentinel:*)
hooks/                       # the optional Sentinel session nudge (a dep-free Node hook)
SETUP.md                     # how it's installed (copy the three folders into .claude/)
```
Each `skills/<category>/README.md` explains the category and **brainstorms what's missing** — the fastest
way to find a good first contribution.

## Add a skill
1. Pick the category that fits (`planning` / `review` / `understand` / `guardrails` / `workflows`). If
   nothing fits, propose a new category in your PR.
2. Create `skills/<category>/<your-skill>/SKILL.md`:
   ```markdown
   ---
   name: your-skill
   description: One or two sentences on WHEN Claude should reach for this skill (this drives triggering).
   # optional: allowed-tools: Read Grep Bash WebFetch
   ---

   # Title

   The methodology, written as instructions to Claude ("You are …", "When X, do Y").
   ```
3. Keep it **focused**: one job, done well. A skill the developer actually uses beats a big one they ignore.

### Multi-stack skills
We want skills that work across stacks **and** stack-specific ones. If your skill is stack-specific, make
the stack clear in the `name`/`description` (e.g. `go-concurrency-review`, `react-render-review`,
`mypy-gate`) so the leader picks it only when the stack matches. Generic skills should detect the stack
themselves (read the manifest/lockfile) rather than assume one.

## Add an agent / workflow / command
- **Agent** (a read-only or specialized subagent): `agents/<name>.md` with frontmatter `name`,
  `description` (say when to use it), and `tools:` (e.g. `Read, Grep, Glob, Bash`). Agents may be nested
  in subfolders, e.g. `agents/<category>/<name>.md`.
- **Workflow**: a skill under `skills/workflows/` that drives a long, multi-pass procedure.
- **Command**: `commands/<name>.md` (→ `/name`) or `commands/<group>/<name>.md` (→ `/group:name`).

## Conventions
- **Names** are kebab-case and unique. Keep the `<verb>-<noun>` shape where it reads well.
- **Descriptions** are trigger-focused (they decide when the skill fires) — say *when to use it*, not just
  what it is.
- **No secrets, ever.** No keys, tokens, or `.env` content.
- **Read-only agents stay read-only.** Sentinel only ever writes under `.sentinel/`.
- Match the surrounding style; one focused job per skill.

## Test it locally
Copy the markdown into a scratch project's `.claude/` and exercise your change:
```bash
mkdir -p /tmp/scratch/.claude && cd /tmp/scratch
cp -r /path/to/Skull/skills /path/to/Skull/agents /path/to/Skull/commands .claude/
claude     # then, in the session: skull
```
Confirm your skill is discovered and assembled when relevant (nested skills need Claude Code ≥ 2.1.183);
for the cartographer, run `/sentinel:map`, make a change, and `/sentinel:sweep`.

## How we say thanks — the monthly TON share ☕
SKULL is funded by donations (a TON "buy me a coffee" widget at
[skull.shop/donate](https://skull.shop/donate)). At the **end of each month**, contributors
who merged work and want to take part can share a **TON wallet address** — include it in your PR (or tell
us in the channel) — and we send a slice of that month's donations their way, split fairly by
contribution. Be honest with everyone: open-source donations are usually modest, so treat this as a
thank-you, not a salary. No address, no problem — contributions are always welcome either way.

## Keep it in sync
A capability is more than its `SKILL.md` — SKULL must stay aware of it and the docs/site must update.
Follow **[docs/ADDING-A-CAPABILITY.md](docs/ADDING-A-CAPABILITY.md)** (the leader's category/proactive table,
the website `catalog/`, regenerate `catalog.json`, push + deploy). Run `node scripts/validate.mjs` (also
enforced in CI) and `node scripts/sync-check.mjs` before opening your PR — or just `/skull:checklist`
in the repo.

## Conduct & license
Be kind, be direct, assume good faith. By contributing you agree your work is licensed under the project's
[MIT License](LICENSE).

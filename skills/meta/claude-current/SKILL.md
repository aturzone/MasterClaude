---
name: claude-current
description: >-
  Stay current with Claude Code and Claude itself. Triggers on "what's new", "what can Claude Code do now",
  "is there a newer/better way", "update skull", "which model should I use", or before relying on any
  claim about a Claude Code feature, model, price, or limit. Checks the installed version, the live changelog,
  and the harness surface SKULL depends on — then reports only the deltas that matter for this project.
allowed-tools: Read, Grep, Glob, Bash, WebFetch, WebSearch
---

# claude-current — check, then speak

Your knowledge of Claude Code has an expiry date, and the changelog moves weekly. **Never assert a current
capability, model id, price, or limit from memory.** This skill is the protocol for replacing memory with a
check — cheap, and it is the difference between advice that's true and advice that was true.

## The one resident rule
Every version-sensitive claim SKULL makes should trace to `docs/CLAUDE-SURFACE.md` (a dated snapshot of
the harness we depend on) or to a live check. If those two disagree, **the live source wins and the snapshot is
stale** — fix it.

## Run this forked
Discovery is context pollution: fetching a changelog dumps kilobytes you don't want resident for the rest of
the session. Run this pass in a **forked subagent** (`context: fork`) and bring back only the deltas — a few
lines, not the raw pages.

## The check
1. **Version.** `claude --version`. The docs describe the *latest* build; the developer may be pinned. Below the
   minimum a skill needs, say so and offer `claude update`.
2. **Changelog.** `WebFetch` `https://code.claude.com/docs/en/changelog.md` — pull only what is **new since
   their version** AND **relevant to this project**. Skip the rest; never dump the whole log.
3. **Surface.** Skim `docs/CLAUDE-SURFACE.md`. If the changelog names something the snapshot contradicts or
   omits (a new hook event, a moved doc URL, a model id, a tokenizer change), the snapshot is drifting.
4. **Claude itself.** For "what's new" broadly, `WebFetch` `https://claude.com/blog` for new models/features;
   confirm anything load-bearing with `WebSearch`. One line each.
5. **SKULL.** The skills are plain `.md`; to update, `git pull` the repo and re-copy
   `skills/ agents/ commands/` into `.claude/` (or offer to).

## When you find drift, close it
A stale fact is a finding. Update `docs/CLAUDE-SURFACE.md`, bump its `<!-- verified: YYYY-MM, cc <version> -->`
stamp, and — if a skill hardcoded the now-wrong fact — fix the skill to reference the surface doc instead. The
monthly canary (`.github/`) files an issue when the changelog outruns the snapshot; this skill is how a human
resolves it.

## Report
A tight, skimmable briefing: what changed, and why it matters **for them**. Two or three items, a line each.
Not a changelog transcript — a filtered delta.

---
*Absorbs the old `whats-new` command (commands are legacy; skills are the forward path). Reads/writes
`docs/CLAUDE-SURFACE.md`. Pairs with `model-router` (which model, now) and `token-economy` (the tokenizer note).*

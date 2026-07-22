---
description: What's new — check your Claude Code version, the official changelog, and whether SKULL has an update
allowed-tools: Bash, WebFetch, WebSearch, Read, Glob
---
As SKULL, give the developer a short, relevant "what's new" briefing. $ARGUMENTS

1. **Version** — run `claude --version`. If it's below **2.1.183**, note that SKULL's categorized
   skills need it and they should run `claude update` so every skill loads.
2. **Changelog** — `WebFetch` `https://code.claude.com/docs/en/changelog.md` and pull out only the items
   that are **new since their version** AND **relevant to this project/developer**. Skip the rest.
3. **SKULL updates** — the skills are plain `.md` in their `.claude/`. To pull the latest, re-run
   the setup (or offer to do it): `git pull` the repo and re-copy `skills/ agents/ commands/` into `.claude/`.
4. **Anthropic & Claude** — `WebFetch` the **Claude blog** (`https://claude.com/blog`) for new models, product
   features and capabilities; plus any notable ecosystem tool that fits their work. Confirm with `WebSearch` and
   mention the one or two that matter, a line each.

Keep it to a tight, skimmable briefing — what changed and why it matters for *them*. Never dump the whole changelog.

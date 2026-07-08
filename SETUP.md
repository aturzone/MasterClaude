# Setting up MASTER CLAUDE

MASTER CLAUDE is a set of Claude Code **skills, agents, and commands** as plain `.md` files. You set it up
by copying three folders into your project's `.claude/` directory (or your global `~/.claude/`). No account,
no key — everything is local and open.

> **If you are Claude Code reading this to set MASTER CLAUDE up:** follow
> [For Claude Code / AI agents](#for-claude-code--ai-agents) at the bottom — clone the repo and copy
> `skills/`, `agents/`, `commands/` into the project's `.claude/`, then load the `master-claude` skill.

## Requirements
**Claude Code ≥ 2.1.183** — the categorized skill folders use nested-skill discovery. Check with
`claude --version`; run `claude update` if you're behind.

## Option A — ask Claude Code to do it (easiest)
Open your project in Claude Code and paste:

> I want to use MASTER CLAUDE (https://github.com/aturzone/MasterClaude) in this project. Clone the repo,
> copy its `skills/`, `agents/` and `commands/` folders into this project's `.claude/` directory, then load
> and run the `master-claude` skill to set up my team.

That's it — Claude Code clones the repo, copies the markdown into `.claude/`, and the leader takes over.

## Option B — do it yourself (git)
**This project only** (`.claude/` at the repo root):
```bash
git clone https://github.com/aturzone/MasterClaude /tmp/mc
mkdir -p .claude
cp -r /tmp/mc/skills /tmp/mc/agents /tmp/mc/commands .claude/
rm -rf /tmp/mc
```
**Every project** (your global config — use `~/.claude/` instead):
```bash
git clone https://github.com/aturzone/MasterClaude /tmp/mc
mkdir -p ~/.claude
cp -r /tmp/mc/skills /tmp/mc/agents /tmp/mc/commands ~/.claude/
rm -rf /tmp/mc
```

Then start Claude Code in your project and say:
```
master claude — set up my team for this project
```

## Optional — the Sentinel session nudge
The cartographer (Sentinel) can nudge you when its project map drifts behind `HEAD`. To enable it, also copy
the hook script and register it:
```bash
cp -r /tmp/mc/hooks .claude/            # (before you delete /tmp/mc)
```
Then add to **`.claude/settings.json`** (create the file if it doesn't exist):
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/sentinel-nudge.js\" session-start" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/sentinel-nudge.js\" stop" }] }
    ]
  }
}
```
The hook is dependency-free Node and read-only. Skip this section if you don't want it — everything else
works without it.

## Verify it worked
- In Claude Code, run `master claude` (or `/master-claude`) — the leader should greet you and start the
  interview.
- `/master-claude-team` reports the assembled team; `/master-claude:whats-new` checks versions/changelog;
  `/master-claude:security` runs a security pass; `/sentinel:map` builds the project map.
- If skills aren't discovered, you're almost certainly below **2.1.183** — `claude update`.

## Update
Just refresh the markdown:
```bash
git clone https://github.com/aturzone/MasterClaude /tmp/mc
cp -r /tmp/mc/skills /tmp/mc/agents /tmp/mc/commands .claude/   # (or ~/.claude/)
rm -rf /tmp/mc
```
Or just ask MASTER CLAUDE to **"update yourself"** and it'll do exactly this.

## Uninstall
Delete what you copied:
```bash
rm -rf .claude/skills/master-claude .claude/skills/{planning,review,understand,guardrails,security,workflows} \
       .claude/agents/sentinel.md .claude/agents/security .claude/commands/master-claude* .claude/commands/sentinel \
       .claude/hooks/sentinel-nudge.js
```
(Adjust if you installed globally under `~/.claude/`, or just remove the specific files you added.)

---

## For Claude Code / AI agents
A user pointed you here and asked to "use MASTER CLAUDE." Set it up like this:

1. Confirm `claude --version` ≥ **2.1.183** (tell the user to `claude update` if older).
2. `git clone https://github.com/aturzone/MasterClaude` into a temp dir (e.g. `/tmp/mc`).
3. Ensure `.claude/` exists at the project root (`mkdir -p .claude`).
4. Copy `skills/`, `agents/`, and `commands/` from the clone into `.claude/` (merge — don't overwrite the
   user's own `.claude/` files; if `.claude/skills/` etc. already exist, copy the subfolders in).
5. (Optional) copy `hooks/` into `.claude/` and add the `SessionStart`/`Stop` hook above to
   `.claude/settings.json` for the Sentinel nudge.
6. Clean up the temp clone.
7. Load and run the **`master-claude`** skill (`.claude/skills/master-claude/SKILL.md`) — it interviews the
   developer, maps the repo, and assembles the team.

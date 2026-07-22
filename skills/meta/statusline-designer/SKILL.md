---
name: statusline-designer
description: >-
  Design a custom Claude Code status line for a CLI user — the bar under the prompt that can show model,
  branch, context budget, cost and time in their colors. Triggers on "status line", "statusline", "status
  bar", "/statusline", "customize my terminal / CLI / prompt", "make my terminal show <model/branch/cost/
  context>", or wanting a sharper Claude Code setup. Opt-in and gated: confirm it's a terminal session and
  that they actually want one before spending a single token designing it — never push it.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Status-line designer — a sharp, custom bar for the CLI

The Claude Code **status line** is the line under the prompt. You can make it show exactly what a developer
wants — model, branch, context budget, cost, time — in their colors, with tasteful effects. This skill
designs one *with* the user. It is **opt-in and gated**: you spend tokens on it only when it's wanted.

## Gate first — don't burn tokens (in order; stop at the first "no")
1. **Is this a terminal / CLI session?** The status line is a *terminal* feature — it doesn't render in a
   non-terminal surface (IDE side-panel, web, desktop). Ask once, plainly: *"Are you running Claude Code in a
   terminal? The status line is a terminal-only thing."* **If no / unsure / not really the terminal → say one
   line ("then a custom status line won't apply — skipping it") and DROP IT.** Don't ask the next question,
   don't raise it again this session.
2. **Do they even want one?** Only if (1) is yes: *"Want me to design you a custom status line?"* **No → stop,
   no nagging.** This gate is the whole point — zero waste when it isn't wanted.
3. Only past **both** gates do you spend tokens on the menu below.

## What it can show (the menu — offer it, let them pick)
Everything here comes from the JSON Claude Code pipes to the status-line command on **stdin**. Show a short
list first; go deeper only if they're keen.

| Want | Field (stdin JSON) |
|---|---|
| Model | `model.display_name` (`model.id`) |
| Folder / project | `workspace.current_dir`, `workspace.project_dir`, `cwd` |
| Git branch / worktree | `workspace.git_worktree`, `workspace.repo.{owner,name}` (or a cached `git` call) |
| Context budget | `context_window.used_percentage` / `remaining_percentage`, `exceeds_200k_tokens` |
| Session cost | `cost.total_cost_usd` |
| Lines changed | `cost.total_lines_added` / `total_lines_removed` |
| Time in session | `cost.total_duration_ms` (or a live clock — needs `refreshInterval`) |
| Reasoning effort | `effort.level` (low…max, when the model supports it) |
| Output style | `output_style.name` |
| Rate-limit usage | `rate_limits.five_hour` / `seven_day` `.used_percentage` (Claude.ai Pro/Max only) |
| Open PR | `pr.number`, `pr.review_state` |
| Vim mode | `vim.mode` (set `hideVimModeIndicator: true` if you render it yourself) |
| CC version | `version` |

Many fields are **absent or null** by context (no worktree → no `workspace.git_worktree`; before the first
API call or just after `/compact` → `context_window.*` may be null; `pr.*` disappears when the PR closes;
`rate_limits` only for subscribers). **Guard every field** so a missing value never breaks the line.

## Effects — offer them, ask before adding, be honest about the limits
Default to **tasteful + fast**. Ask permission before anything fancy, and tell the truth about what's real:
- **Color** — ANSI / 256 / truecolor: per-segment colors, a gradient, or **threshold colors** (context %
  goes green → yellow → red as it fills). Use `printf '%b'` for reliable escapes.
- **Glyphs** — emoji (📁 🌿 💰 ⏱️) or **powerline / Nerd-Font** separators *if their font has them* (ask).
- **Clickable** — OSC 8 hyperlinks (`\e]8;;URL\a text \e]8;;\a`) for a PR/repo — iTerm2 / Kitty / WezTerm
  only; Terminal.app and some tmux/ssh setups strip them.
- **"Motion" — be honest: smooth animation is NOT possible.** The script only re-runs on conversation events
  (debounced ~300ms; an in-flight run is cancelled if a new event arrives) or, if you set **`refreshInterval`**
  (seconds, min 1), on a timer. So the most you can do is a **once-a-second** spinner / pulse / clock that
  advances on each refresh — and it costs a script run every second while idle. Offer it; never default to it.

## Build it
1. **Write the script** (e.g. `~/.claude/statusline.sh`): read the stdin JSON (`jq` if present, else a tiny
   parser). Keep it **fast** — it runs on every update. Cache expensive `git` calls keyed by `session_id`
   (`/tmp/cc-status-$session_id`). Width from `$COLUMNS` (not `tput cols` — output is captured, not a tty).
2. **Wire settings** — add to `~/.claude/settings.json` (all projects) or `.claude/settings.json` (this one):
   ```json
   { "statusLine": { "type": "command", "command": "~/.claude/statusline.sh", "padding": 0 } }
   ```
   Add `"refreshInterval": 1` **only** if they chose a live clock / motion. **Show the config + script and
   confirm before writing** — it's their config, and `statusLine` runs a shell command on every update (same
   trust gate as hooks; an untrusted workspace shows `statusline skipped` instead).
3. **Cross-platform** — macOS / Linux: bash + `jq`. **Windows**: Git Bash present → use **forward-slash**
   paths (`C:/Users/you/statusline.sh`; backslashes are eaten as escapes); no Git Bash → a PowerShell script
   via `powershell -NoProfile -File C:/path/status.ps1`.
4. **Preview before declaring done** — run it with mock input and show them the rendered line:
   ```bash
   echo '{"model":{"display_name":"Opus"},"workspace":{"current_dir":"/repo"},"context_window":{"used_percentage":8}}' | ~/.claude/statusline.sh
   ```
   Iterate on order / colors / content with them. A non-zero exit or empty output **blanks** the line; if
   escapes print literally, switch `echo -e` → `printf '%b'`. Debug a live session with `claude --debug`.

## Native shortcuts (mention them)
Claude Code ships a built-in **`/statusline "show model + a context % bar"`** (it generates the script and
wires settings) and a `statusline-setup` agent. This skill is the **guided** version — the gate, the full
field menu, honest effects, the cross-platform build and the preview loop. For a quick one-liner, point them
at `/statusline`; for a tailored, iterated bar, design it here. To remove one: `/statusline delete`.

---
*Builds on Claude Code's native status line + `/statusline` (credit: Claude Code). The gate exists to honor
[[token-economy]] — never spend tokens on a status line that isn't wanted. Pairs with [[workspace-architect]]
for the rest of the `.claude/` setup; the leader keeps [[skull]]'s command of the Claude Code feature
surface current via what's-new.*

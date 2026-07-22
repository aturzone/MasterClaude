<!-- verified: 2026-07, cc 2.1.210 -->
# The Claude Code surface SKULL depends on

A **dated snapshot** of the harness features the skills reference, so this rots **visibly in one file**
instead of silently across 70. Every version-sensitive claim in a skill should trace to a line here.

**How to use it:** skills reference *this file*, not hardcoded facts. When the changelog moves, update this
one page (and re-stamp `<!-- verified: YYYY-MM, cc <version> -->`). `scripts/validate.mjs` warns when a stamp is
older than ~3 months. The `claude-current` skill drives the refresh.

> ⚠️ **The rule that matters more than the table below:** your knowledge of Claude Code expires. **Never assert
> a current capability, model id, price, or limit from memory — check, then speak.** This file is a cache, not
> an oracle; when it and the live changelog disagree, the changelog wins and this file is stale.

---

## Models (as of the stamp)
| Model | id | Notes |
|---|---|---|
| Claude Fable 5 | `claude-fable-5` | most capable widely-released; adaptive thinking always on |
| Claude Opus 4.8 | `claude-opus-4-8` | **recommended default for agentic coding**; effort defaults to high |
| Claude Sonnet 5 | `claude-sonnet-5` | |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | the scout tier |

- **Dateless ids from 4.6 on are still pinned snapshots**, not evergreen pointers — `claude-opus-4-8` will not silently become 4.9.
- **Opus 4.7+ uses a new tokenizer: the same text is ~30% more tokens** than pre-4.7. Any token budget inherited from older assumptions is wrong — this is why `token-economy` and `model-router` must not hardcode token counts.

## Hooks — 30 events (skills should assume this whole surface exists)
`SessionStart · Setup · UserPromptSubmit · UserPromptExpansion · PreToolUse · PermissionRequest ·
PermissionDenied · PostToolUse · PostToolUseFailure · PostToolBatch · Notification · MessageDisplay ·
SubagentStart · SubagentStop · TaskCreated · TaskCompleted · Stop · StopFailure · TeammateIdle ·
InstructionsLoaded · ConfigChange · CwdChanged · FileChanged · WorktreeCreate · WorktreeRemove · PreCompact ·
PostCompact · Elicitation · ElicitationResult · SessionEnd`

- A hook can run a shell command, an HTTP request, an **LLM prompt, or a subagent**, and can be **scoped to a single skill or agent** via `hooks:` frontmatter.
- `PreToolUse` → `permissionDecision: allow|deny|ask|defer` + `updatedInput`; `PostToolUse` → `updatedToolOutput`; `PermissionDenied` → `retry`; exit code 2 blocks (and, on the teammate events, sends feedback).

## Skill frontmatter we use / could use
`name` · `description` (triggers only) · `allowed-tools` · **`disable-model-invocation`** (removes from context entirely — zero token cost) · **`disallowed-tools`** · **`model`** · **`effort`** · **`context: fork`** · `agent` · **`hooks`** · **`paths`** (globs that gate auto-activation → the basis for `.claude/rules/`) · `arguments` · `argument-hint` · `shell`.
- **Custom commands merged into skills.** `commands/` still works but is legacy; `skills/` is the forward path.

## Subagent frontmatter
`name` · `description` · `tools` · `disallowedTools` · `model` (incl. `fable`, full ids; default `inherit`) · `permissionMode` · `maxTurns` · **`skills:`** (preloads full skill content) · `mcpServers` · `hooks` · **`memory: user|project|local`** (cross-session learning) · **`background`** (default true since v2.1.198) · `effort` · **`isolation: worktree`** (own worktree, branched from the DEFAULT branch, auto-cleaned) · `color` · `initialPrompt`. `SendMessage` resumes a subagent by id.

## Orchestration primitives
- **Dynamic workflows / `ultracode`**: a JS script Claude writes that orchestrates subagents *outside* your context (`agent()`, `pipeline()`); caps 16 concurrent / 1,000 total; resumable, cached. Intermediate results stay in script variables. `wf-codebase-audit` / `wf-security-audit` are exactly this shape.
- **Agent teams** (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): full sessions that message each other; gates via `TeammateIdle`/`TaskCreated`/`TaskCompleted` (exit 2 blocks). Don't design a default around it — it's off by default.
- **`/deep-research`**: fan-out search that votes on each claim and drops the ones that don't survive.

## Permissions / safety a leader must know
- **`defaultMode: "auto"` is IGNORED from repo settings** — a repo cannot grant itself auto mode (must be `~/.claude/settings.json`).
- Entering auto mode **drops broad allow rules** (`Bash(*)`, `Agent` allow rules); narrow rules survive.
- **Conversation-stated boundaries are enforced but re-read from the transcript — compaction can lose them. Deny rules are the hard guarantee.**
- **Protected paths** never auto-approved and NOT overridable by `permissions.allow`: `.git`, `.claude` (except `.claude/worktrees`), `.mcp.json`, `.claude.json`, shell rc files, `.npmrc`, `.pre-commit-config.yaml`, …
- **Checkpointing/`/rewind` does NOT track bash file changes** (`rm`, `mv`) — only file-tool edits. Not a substitute for git. (This is why `skull-git` commits before risky bash.)
- **Sandboxing** is Bash-only, OS-enforced; **native Windows unsupported (WSL2 required)**; the proxy doesn't terminate TLS by default, so domain fronting can bypass an allowlist.

## Docs locations (⚠ these MOVED)
- **`docs.claude.com` now 301s to `platform.claude.com`** (the API).
- **Claude Code docs are at `code.claude.com/docs`.** Changelog: `code.claude.com/docs/en/changelog.md`.
- Any skill linking to the old Claude Code paths on that host is stale — `validate.mjs` fails on such a link.

---
*Refreshed by `skills/meta/claude-current`. When you update this, bump the stamp at the top and open a PR — the
monthly canary files a drift issue when the changelog outruns this page.*

---
name: mc-git
description: >-
  The git mechanics MASTER CLAUDE runs by default — invoked by the leader, not auto-triggered. Covers
  session awareness (branch, dirty count, ahead/behind), branch-before-you-build (mc/<slug>, never the
  default branch), commit at every green step (conventional, Fixes #N), a WIP commit before risky bash,
  finishing a branch (PR/merge/delete), worktrees for parallel writers, and the bright line: local git
  aggressive by default, remote git always consented, never auto-push. The off switch lives in
  .claude/master-claude.json.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash
---

# mc-git — intimate with git, locally; consented, remotely

MASTER CLAUDE works *in* git, not next to it. Every non-trivial change lands on its own branch, every green
step is a commit, and the history is the undo. That intimacy is **local**: branching, committing, stashing and
worktrees happen freely, by default. The moment anything leaves the machine — a `push`, a force-push, a PR —
it stops and asks. **Never auto-push.** "Intimate with git" means *local* intimacy; the remote is always the
user's call.

This is the mechanics the leader delegates to. It's `disable-model-invocation` — zero context cost until the
leader (or `cap-execute-plan`) reaches for it.

## Session awareness — know where you stand before you touch anything
On starting work in a repo, read the git state in one cheap, offline pass:
```bash
git status -sb                       # branch, upstream, dirty files — all in the header line
git rev-parse --abbrev-ref HEAD      # current branch ("HEAD" when detached)
```
Ahead/behind, **guarded for no-upstream** (a fresh branch has none — don't let it error):
```bash
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git rev-list --count @{u}..HEAD    # commits ahead of upstream
  git rev-list --count HEAD..@{u}    # commits behind
fi
```
The `sentinel-nudge.js` hook already surfaces `git: on <branch>, N dirty, A ahead/B behind` at SessionStart —
read that line, don't re-run it.

## Never build on the default branch
Any change touching **more than one file** starts on `mc/<slug>` — a short, kebab-cased slug of the task
(`mc/auth-idor-fix`, `mc/dark-mode`). Detect the default branch first:
```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's#refs/remotes/origin/##'   # e.g. main
git branch --show-current                                                                 # fresh repo, no origin
```
If you're on it, branch **before the first edit**:
```bash
git switch -c mc/<slug>              # modern; git checkout -b on old git
```
**Ask once per project**, then remember: write `git.autobranch` into `.claude/master-claude.json`. After that,
branching is automatic and silent — one of the aggressive-by-default local ops.

## Commit at every green step
A step that verifies (build/tests/the step's check pass) gets a commit — small, conventional, tied to the work:
```bash
git add -A && git commit -m "fix: reject unowned order ids in GET /orders/:id

Fixes #42"
```
- **Conventional prefix** carries the meaning: `feat:` `fix:` `chore:` `refactor:` `test:` `docs:`.
- **Reference the issue/finding:** `Fixes #N` / `Refs #N`. This is the loop `mc-issues` closes —
  finding → issue → branch → commit `Fixes #N` → merge → issue auto-closes → the next sweep confirms.
- Cadence is `commitCadence` in config: `step` (every green step, default), `logical` (at logical units),
  `off` (you commit by hand).

## Commit before risky bash — the only real undo
Claude Code checkpointing and `/rewind` track **edits made through the Edit/Write tools**. They do **not**
track file changes made by a shell command — `rm`, `mv`, `sed -i`, a build script, a codemod. Before any
destructive bash, a WIP commit is the **only** thing that can bring the tree back:
```bash
git add -A && git commit -m "wip: checkpoint before <the risky op>"
# ...run the risky command...
git reset --hard HEAD~1              # undo if it went wrong (or: git reset --hard <wip-sha>)
```
This isn't caution theatre — it's the difference between a one-command recovery and lost work.

## Finish the branch — don't stop at the last commit
At a stage exit (the plan's last green step; the feature done), offer the wrap-up — one of:
```bash
gh pr create --fill --base <default-branch>              # if gh is available — REMOTE, so ASK first
git switch <default-branch> && git merge --no-ff mc/<slug>   # local merge
git branch -d mc/<slug>                                  # delete a spent branch
```
Pick the one that fits and propose it; don't leave a green branch dangling with no home.

## The bright line — local aggressive, remote consented
| Class | Operations | Posture |
|---|---|---|
| **Local** | branch · switch · commit · stash · worktree add/remove · `reset` on your own WIP · local merge | **Aggressive by default** — do it, no prompt (honoring the off switch) |
| **Remote** | `git push` · `git push --force` / `--force-with-lease` · `git push --tags` · `gh pr create` | **Always ask** — a clear yes, every time, per action |
| **Refused** | force-push to the **default branch** (`main`/`master`) | **Refused outright** — rewriting shared default history is a catastrophe rail, not a prompt |

`push` and PR creation are never automatic — not under `autonomy: act`, not "to save a step". The user's remote
is theirs. This is the one place mc-git is deliberately timid.

## Worktrees — for parallel writers
When you dispatch **subagents that edit in parallel**, give each its own worktree so they never clobber one
tree. Prefer the native `isolation: worktree` on the subagent (the Agent/Task frontmatter) — but know it
branches from the **default branch**, so it fits **independent** tasks, not stacked/dependent work. For the
full lifecycle (create → work → integrate → clean up, and the "am I already in a worktree?" check), see
**worktree-isolation**. Don't hand-roll `git worktree` when a managed tool exists.

## The off switch — `.claude/master-claude.json`
Everything above is on by default; this is how a user turns it down. All keys optional:
```json
{ "git": { "autobranch": true, "commitCadence": "step", "conventional": true } }
```
| Key | Values | Default | What it controls |
|---|---|---|---|
| `git.autobranch` | bool | `true` | branch to `mc/<slug>` before a multi-file change |
| `git.commitCadence` | `"step"` \| `"logical"` \| `"off"` | `"step"` | commit every green step / at logical units / never auto |
| `git.conventional` | bool | `true` | conventional-commit message format |

Absent ⇒ all on. `commitCadence: "off"` still lets you commit when asked — it only stops the automatic cadence.
The bright line is **not** configurable: remote always asks, force-push to the default branch is always refused.

---
*The canonical git mechanics for MASTER CLAUDE — `cap-execute-plan` and the leader delegate here so the posture
never drifts. Pairs with `mc-issues` (the `Fixes #N` commit→issue loop) and `worktree-isolation` (parallel
writers). Local intimacy, remote consent, never auto-push.*

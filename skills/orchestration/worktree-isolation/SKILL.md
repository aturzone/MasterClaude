---
name: worktree-isolation
description: >-
  Run parallel or risky work without collisions using git worktrees. Triggers on "worktree", "isolate this
  change", "try this without touching main", "run these agents in parallel safely", "spike/experiment", or
  whenever multiple subagents or features would edit the same tree at once. Each task gets its own branch +
  working directory, so concurrent work never clobbers another's files and a failed experiment is thrown
  away by deleting a folder. Pairs with subagent-orchestration for true parallel building.
allowed-tools: Read, Grep, Glob, Bash
---

# Worktree isolation — parallel work that never collides

Parallel agents are only safe when they don't write to the **same files**. A git **worktree** gives each
task its own branch *and* its own working directory off the one repo — so two efforts run side by side
without stepping on each other, and a dead-end spike is discarded by removing a folder.

## When to use it
- You're about to **dispatch parallel subagents that edit code** (not just read) — give each its own worktree.
- A **risky experiment / spike** you want to try without polluting the main tree.
- **Several features/bugfixes** in flight at once.
- A long multi-task build that wants a clean branch per task.

*Not needed* for read-only parallel work (research/review) — those don't write, so they can't collide.

## Before you create one (don't nest, don't fight the harness)
1. **Already isolated?** Compare `git rev-parse --git-dir` vs `--git-common-dir` — if they differ (and
   you're not in a submodule), you're **already in a worktree** → skip creation, just use the branch.
   A worktree inside a worktree is the #1 mistake.
2. **Prefer a native worktree tool.** If your harness exposes one (e.g. **`EnterWorktree`** / a `/worktree`
   command), use it — hand-rolling `git worktree add` when a managed tool exists creates phantom state the
   harness can't track. For a **dispatched subagent**, prefer the harness's `isolation: worktree` frontmatter
   (credit **obra/superpowers**): it branches from the **default** branch and **auto-cleans** when the work is
   left unchanged, so you never hand-roll or garbage-collect the tree. Fall back to raw git only when there's
   no native tool.
3. **Ignore-check first.** Before adding a repo-local dir (prefer a hidden `.worktrees/`), confirm it's
   git-ignored (`git check-ignore -q`); if not, add it to `.gitignore` and commit before creating.
4. **Clean baseline.** After creating + installing deps (npm/cargo/pip/go per the stack), run the tests
   once — if already red, report and ask, so later failures are attributable to the new work.

## How (raw git fallback)
```bash
# one worktree per task, each on its own branch, all sharing the same repo/history
git worktree add ../wt-feature-x -b feature-x      # new branch in a sibling dir
git worktree add ../wt-bugfix-y -b bugfix-y
git worktree list                                   # see them all
# ...work happens in each dir independently...
git worktree remove ../wt-feature-x                 # discard a spike, or after merging
git worktree prune                                  # tidy stale entries
```
Rule: **one worktree per parallel writer.** Assign each subagent/teammate its own worktree path in its
delegation brief; never let two write the same tree.

## Lifecycle
1. **Create** a worktree+branch per parallel task (sibling dirs keep paths short).
2. **Work** — each agent stays in its own dir; commit there as it goes.
3. **Integrate** — review each branch, then merge the good ones (or open PRs); a fresh reviewer per branch
   pairs well here.
4. **Clean up** — `git worktree remove` the merged/abandoned ones; `prune` stragglers. Don't leave a
   graveyard of worktrees behind.

## Cautions
- Worktrees share the repo's objects + config — they're cheap, but **don't check the same branch out twice**.
- Build artifacts/deps may need re-installing per worktree (separate `node_modules`, etc.).
- Remember to remove them — orphaned worktrees confuse future sessions and tools.

---
*Credits:* git-worktree isolation for parallel agent work is a pattern from **superpowers**
(`obra/superpowers`, MIT) — though superpowers still reimplements it in ~200 lines of shell; the native
`isolation: worktree` frontmatter above is available ground it hasn't taken. See `docs/ECOSYSTEM.md`. Pairs
with **subagent-orchestration** + **model-router**.

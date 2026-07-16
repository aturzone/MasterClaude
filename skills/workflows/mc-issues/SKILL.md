---
name: mc-issues
description: >-
  Turn the team's findings into GitHub issues, and keep them in sync. Triggers on "file these as issues",
  "sync findings", "open issues for the security review / the QA run / Sentinel", "close the fixed ones", or
  after a sweep/audit that produced findings. Local finding files stay the source of truth; issues are the
  human surface. Security findings on a public repo are held back by default.
allowed-tools: Read, Grep, Glob, Bash
---

# mc-issues — findings become issues, without losing the machine

Findings live as files (`.sentinel/findings/`, `.security/findings/`, `.mc/qa/findings/`, `.mc/design/findings/`)
because that is what makes them work: offline, deterministic, and carrying the dedup fingerprints Sentinel
depends on. But a folder of `F-0013.md` files is a bad **interface** — nobody assigns one, closes one with a
commit, or discusses one there. This skill gives each finding a GitHub issue as its human surface, and keeps
the two in sync.

## The model — local canon, issue surface
- **The finding file is the source of truth.** Sync is one-way: local → GitHub.
- **One write-back:** the issue number is stamped into the finding's frontmatter (`issue: 123`). After that,
  dedup costs zero API calls — the file remembers its issue.
- **Fresh clone / another machine?** No `issue:` field yet, but the fingerprint is in the issue body, so sync
  finds it by search and re-links instead of filing a duplicate.

```bash
node .claude/skills/workflows/mc-issues/… ↑ no — the script lives at the repo's scripts/:
node scripts/mc-issues.mjs --status        # mode, counts, how many still pending
node scripts/mc-issues.mjs --dry-run       # say what would happen, touch nothing
node scripts/mc-issues.mjs                  # create / reopen / close to mirror local state
```

## What syncs, and how it maps
| Local | GitHub |
|---|---|
| a new `open` finding with no `issue:` | `gh issue create`, labels `mc:finding` · `mc:agent:<who>` · `mc:sev:<level>` · `mc:theme:<t>`; number written back |
| status → `resolved` / `accepted` / `false-positive` / `stale` | issue **closed** with the reason as a comment |
| a `resolved` finding's fingerprint reappears (regression) | issue **reopened** — never a new number; the history is the point |
| cross-links (`related:`) | rendered as GitHub `#N` references in the body |

The loop this enables — and the reason it exists: **finding → issue → branch → commit `Fixes #123` → merge →
issue auto-closes → the next sweep confirms with positive evidence → the finding resolves.**

## The disclosure gate — the one rule that must hold
A `critical` security finding posted to a **public** repo's issues is a published exploit with a file and a
line. So on a public repo, **security (`S-*`) findings are held back by default** and listed loudly. Two
deliberate exits, never a default:

```bash
node scripts/mc-issues.mjs --include-security          # opt in, per run, eyes open
node scripts/mc-issues.mjs --repo owner/private-mirror # or route them to a private repo
```

Sentinel/tester/designer findings sync normally; only security is gated, and only on a public repo. On a
private repo everything syncs.

## Never from a hook
This talks to the network. Hooks (`sentinel-nudge.js`) must stay fast and offline. Run this at a natural
moment — the end of a sweep, `/master-claude:issues`, or by hand. With no `gh`, no auth, or no remote, it
records `mode: local`, changes nothing, and says so; the findings are safe as files and drain on the next
online run. Create is capped at ~30/run so a first sync on a big backlog goes in polite waves.

---
*Reads the finding files written by `sentinel`, `security-auditor`, `tester`, `designer` — see
docs/FINDING-SPEC.md. Pairs with `mc-git` (the `Fixes #N` commit loop). Requires the `gh` CLI, authenticated.*

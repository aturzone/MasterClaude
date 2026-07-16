<!-- verified: 2026-07, cc 2.1.210 -->
# Enforcement — MASTER CLAUDE's two tiers

Most of MASTER CLAUDE is **guidance**: markdown a skill loads into context, which the model then follows.
Guidance is honest but soft — it can lose to compaction on a long session, or to a model talking itself into
"just this once." A few rules are too important for soft. This page is about those, and the switch that turns
them from a request into a guarantee.

## Tier 1 — inert by default (guidance)

Copying MASTER CLAUDE's `.md` files into `.claude/` **runs nothing**. There are no daemons, no autostart, no
background processes. Skills and agents are plain text that Claude Code reads when relevant. Their rules —
"verify before done", "tests are sacred", "read-only toward your source" — are disciplines the model *holds*,
not walls it *hits*. This is the safe default, and it stays the default even though the repo also ships hook
scripts under `hooks/`: **a script in `hooks/` does nothing until it is deliberately wired.** Shipping them
does not make MASTER CLAUDE non-inert.

## Tier 2 — opt-in enforcement (hooks)

A `PreToolUse` hook runs *before* a tool call and can **deny** it, **ask** for confirmation, or **allow** it —
a hard gate the model cannot narrate its way past. MASTER CLAUDE ships four, all dependency-free Node, all
**fail-open** (any error or malformed input → allow; a guardrail must never wedge a session) and all exit 0
(blocking is done with the decision, never the exit code):

| Hook | Event | What it guarantees |
|---|---|---|
| `hooks/sentinel-nudge.js` | SessionStart · Stop | Read-only awareness line: git state + whether the Sentinel map has drifted behind HEAD. Never blocks. |
| `hooks/prod-rails.mjs` | PreToolUse · Bash | On a box `.mc/env` marks **production**, denies a short list of irreversible shell (`rm -rf`, `DROP TABLE`, unbounded `DELETE`, `terraform destroy`, `kubectl delete`, force-push, raw disk writes…). |
| `hooks/guardian-test-guard.mjs` | PreToolUse · Edit \| Write | **Denies** silently disabling a test (adding `it.skip`/`xit`/`pytest.mark.skip`/`@Ignore`/`t.Skip()`, or commenting out an assertion). **Asks** on the doubtful cases (`.only` focus, an assertion count that merely dropped, a full-file write carrying a skip marker). Scoped to test files only. |
| `hooks/findings-scope.mjs` | PreToolUse · Write \| Edit | Enforces "read-only toward your source" for the read-only agents: a write outside their finding dirs (`.sentinel/`, `.security/`, `.mc/`) or `mc.html` is denied. **Agent-scoped — never wired globally.** |

### Deny vs ask (why guardian-test-guard is careful)

A guardrail that hard-blocks a legitimate edit is a guardrail that gets switched off. So `guardian-test-guard`
only **denies** the unambiguous test-defeats — a skip/ignore marker being *added*, or an assertion being
*commented out* — and drops to **ask** wherever intent is genuinely unclear (a `.only`, a dropped assertion
count that might be an honest refactor, a full-file `Write` where it can't diff to prove the marker is new).
It says what it caught and why, and always leaves the door open: *if the test is genuinely wrong, fix or delete
it deliberately — don't skip it to go green.*

## Arming it

Two ways, both opt-in:

**A. Install the plugin.** `hooks/hooks.json` wires the three globally-safe hooks (`sentinel-nudge`,
`prod-rails`, `guardian-test-guard`) automatically. It does **not** wire `findings-scope` — that one is
agent-scoped and belongs on the read-only agents' `hooks:` frontmatter, not in global settings.

**B. Run the installer (for the plain-`.md` tier).** If you copied the `.md` files by hand:

```bash
node scripts/install-hooks.mjs          # targets the current project; pass a dir to override
```

It shows the exact `.claude/settings.json` diff (absolute paths to this checkout's `hooks/`), **asks before
writing**, is idempotent (re-running once wired is a no-op), preserves every other key in your settings, and
writes nothing on anything but an explicit `y`. Decline and it prints the block to paste yourself.

`findings-scope` is wired per-agent, not by the installer — attach it to a read-only agent via its `hooks:`
frontmatter when you want that agent's source-write ban enforced rather than merely promised.

## The honest line

Other guardrail packs write rules as "Iron Laws" and trust the model to obey. Ours are guidance too — until
you arm them. The difference MASTER CLAUDE ships is the **arming switch**: their Iron Laws are requests; ours
have an on position. Off by default, on when you decide, and honest about which is which.

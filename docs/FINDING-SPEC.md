# The finding spec — one contract for every MASTER CLAUDE agent

Four agents write findings: **Sentinel** (`.sentinel/findings/F-NNNN.md`), the **Security Auditor**
(`.security/findings/S-NNNN.md`), the **Tester** (`.mc/qa/findings/T-NNNN.md`) and the **Designer**
(`.mc/design/findings/D-NNNN.md`).

Until this spec, they used **four different severity vocabularies and three different status vocabularies**, and
two of them specified no fields at all. That is not a taxonomy, it is four conventions that happen to share a
folder shape — and it produced real bugs: `mc-dashboard.mjs` ranked the Designer's *top* severity (`blocker`)
below `info`, and read no `status` at all, so a resolved critical still forced a FAIL verdict.

**One scale. One status set. Every consumer can trust it.**

---

## Severity — exactly these five

| Severity | Means | Rule of thumb |
|---|---|---|
| `critical` | Someone is locked out, exposed, or losing data. Ship-blocking. | An auth bypass. A keyboard-unreachable control. Data loss on a common path. |
| `high` | Real harm or real difficulty, on a path people actually take. | IDOR on a non-admin route. A 6s LCP. A form that can't be completed with a screen reader. |
| `medium` | Wrong, but with a workaround or a narrow blast radius. | A missing index. An unhandled edge case. A confusing error. |
| `low` | Friction, polish, or a latent risk. | Inconsistent spacing. A missing test on a stable helper. |
| `info` | Worth recording, not worth fixing now. | An observation, a note for later, a rejected alternative. |

**Severity is about impact on a person, never about how much it bothers you.** A band-1 accessibility miss is
`critical` on a beautiful page; a spacing nit is `low` even if it offends you.

### Mapping from the old vocabularies
Agents may keep their native word in a `band:` or `native:` field for their own reasoning, but the `severity:`
field **must** be one of the five above.

| Old | → | Why |
|---|---|---|
| Designer / `fe-design-review`: `blocker` | `critical` | It is ship-blocking by definition — that is what blocker meant. |
| Designer: `major` | `high` | |
| Designer: `minor` | `low` | |
| `cap-self-review`: `nit` | `info` | |
| `wf-codebase-audit`: `Critical`/`High`/`Medium`/`Low` (capitalised) | lowercase | The scale is lowercase. |
| Tester: *(none specified)* | pick from the five | The Tester previously had no vocabulary at all. |

## Status — exactly these five

| Status | Means |
|---|---|
| `open` | Still true. The default. |
| `resolved` | Fixed, **and confirmed by positive evidence** — a passing test, a re-run, a diff. Not "the agent said so". |
| `accepted` | Real, understood, and deliberately not being fixed. Requires a reason. |
| `false-positive` | Not actually a defect. Requires a reason. |
| `stale` | The code it described is gone; it can no longer be evaluated. |

Mapping: `fixed` → `resolved` · `wontfix` / `accepted-risk` → `accepted` · `false-positive` unchanged ·
`stale` unchanged.

**Every consumer must read `status`.** A finding that is not `open` does not count toward a verdict, a badge, or
a nudge. This is not optional politeness — it is the difference between a dashboard that means something and one
people learn to ignore.

---

## Frontmatter

**Required on every finding, from every agent:**

```yaml
---
id: F-0013                 # <PREFIX>-<4 digits>. F=sentinel S=security T=tester D=designer
agent: sentinel            # sentinel | security | tester | designer
severity: high             # critical | high | medium | low | info
status: open               # open | resolved | accepted | false-positive | stale
title: JWT signature is never verified
path: src/auth/verify.ts   # repo-relative. The one place to look first.
---
```

**Optional, and expected wherever the agent can supply them:**

| Field | Use |
|---|---|
| `line` | Line number. Never part of the fingerprint — code moves. |
| `symbol` | Function/class/component name. Survives line drift. |
| `fingerprint` | Stable identity — see below. |
| `related` | Ids of related findings. **Symmetric**: if A lists B, B lists A. |
| `issue` | The GitHub issue number once synced (see `mc-issues`). Its presence means "already filed". |
| `first_seen` / `last_seen` | Commit SHAs. |
| `reason` | **Required when status is `accepted` or `false-positive`.** A status without a reason is an unexplained dismissal. |

**Agent-specific fields are allowed and encouraged** — they must not collide with the above:
`type` + `theme` (Sentinel) · `owasp` + `cwe` + `confidence` (Security) · `band` (Designer) · `area` (Tester).

## Body

```markdown
# <title>

## Why it matters
The consequence to a person. Not the rule number.

## Evidence
`path:line` + the smallest snippet that proves it. A finding with no evidence is an opinion.

## Suggested action
The concrete fix. Specific enough to act on without re-deriving the analysis.

## Related
- F-0007 — same auth boundary
```

## Fingerprint — the dedup contract

```
fingerprint = short hash of:  type | path | symbol | normalized one-line evidence
```

**The line number is deliberately excluded.** Code moves; the defect doesn't. Including the line would remint a
new finding every time someone adds an import above it.

Two rules that follow, and they are the whole point:
- **Same fingerprint → the same finding.** Update it; never mint a second id.
- **A regression reopens; it never remints.** If a `resolved` finding's fingerprint reappears, set it back to
  `open` and note the SHA. A new id would erase the history that it happened before — which is exactly the
  signal worth keeping.

Ids are allocated monotonically and **never reused**, even after deletion.

---

## For consumers

Anything that reads findings — `mc-dashboard.mjs`, `hooks/sentinel-nudge.js`, `mc-issues`, a future badge —
must:
1. Parse the frontmatter **between the `---` fences**, not by scanning the whole file. A body line reading
   `path: something` is prose, not a field.
2. Read `status` and exclude anything that is not `open` from counts and verdicts.
3. Treat an unknown `severity` as a **bug in the producer**, not as `info`. Fail loudly; silent misranking is how
   `blocker` ended up sorting below `info` for months.
4. Stay offline-safe if it runs on a hook. Findings are local files precisely so that the fast paths never need
   the network.

---
*Enforced by `scripts/validate.mjs` (frontmatter conformance) — a finding that violates this spec fails CI.*

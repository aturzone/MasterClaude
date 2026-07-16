---
name: ops-incident
description: >-
  Incident commander for a production emergency. Triggers on "prod is down", "we're seeing 500s", users who
  can't log in, check out, or load the page, an alert firing, a pager going off, or "the site is slow" in a
  production context. Stabilizes first, diagnoses second, and keeps a timeline — the advisor, never the one
  typing on the prod box.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Incident response — stabilize first, diagnose second

In an incident the instinct is to find the cause. Wrong order. **Stop the bleeding first**; the diagnosis
can wait until users are served again. You are the incident advisor: you call the plays and keep the log —
you do not edit code on the production box (the rationalizations below are why that never becomes the
shortcut).

## The recipe, in order
1. **Stabilize with the cheapest reversible lever.** Reach for the smallest thing that restores service:
   **feature-flag the bad path off → roll back to the last-known-good release (`ops-rollback`) → roll
   *forward* only when the fix is genuinely smaller and safer than the rollback.** Reversible beats clever.
2. **Call severity.** How many users, how bad, and is it getting worse? That answer sets everything — who
   you wake, how often you communicate, whether you canary the fix or just ship it.
3. **Keep a timeline from minute one.** Timestamped facts in `.mc/incident-<date>.md`: what you saw, what
   you did, what happened next. Written live, not reconstructed after. (These lines become the post-mortem,
   and the issue comments once `mc-issues` lands.)
4. **Never edit code on the prod box.** Reproduce in staging or locally, fix it there, and ship the fix
   through the normal pipeline (`ops-ship`). A hand-edit on prod is an untracked, untested, un-revertable
   change layered on top of an outage.
5. **Communicate state changes, not vibes.** "Rolled back to v1.4.1 at 14:12; error rate falling" — not
   "still looking into it". Every message moves a fact.

## Severity, fast
| | Users hit | Getting worse? | You… |
|---|---|---|---|
| **critical** | many / paying / data at risk | yes | stabilize now, wake people, update every few minutes |
| **high** | a real segment | maybe | stabilize, staff it, update on a clock |
| **medium** | few, workaround exists | no | fix in hours, no heroics |

## The rationalizations — and the counter
Under pressure you will hear these. They are all wrong, and here's why:
| "…" | Why it's wrong |
|---|---|
| "it's a one-line fix, faster to edit it live" | The one-liner is untested and untracked; if it's wrong you've stacked a second incident on the first, with no revert. Ship the one line through the pipeline. |
| "we can't reproduce it locally, so I'll just debug in prod" | Debugging is mutating — you'll add logs, restart, poke state — changing the very system you're trying to read. Reproduce from `ops-observe` data; prod stays read-only. |
| "the rollback is riskier than rolling forward" | Sometimes true — but only when the forward fix is *smaller* and already tested. Said to skip verifying the fix, it's a rationalization. Default to the reversible lever. |

**Red flags — stop:** you've typed a mutating command into the prod shell · you're 20 minutes in with no
timeline · you're diagnosing while users are still down · you're about to deploy an unverified "fix"
straight to prod.

## When it's stabilized
Service restored is not resolved. Close the loop: root-cause in staging, fix through the pipeline, and a
blameless `ops-postmortem` — the incident isn't over until the artifact that would have caught it exists.

---
*Pairs with `ops-observe` (the data you diagnose from) and `ops-rollback` (the usual stabilizing lever).
Credits: incident-command structure and "mitigate before you diagnose" from standard SRE incident practice.*

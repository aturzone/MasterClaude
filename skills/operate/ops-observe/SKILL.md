---
name: ops-observe
description: >-
  Read the system's own story before you touch it — logs, metrics, health, recent deploys, error rates.
  Triggers on "why is it slow", "what's happening on the server", "check the logs", "is it healthy", and as
  the first step of `ops-incident`. Read-only toward the system: it gathers evidence and files findings, it
  never mutates the box.
allowed-tools: Read, Grep, Glob, Bash, Write
---

# Observe — let the system tell you what's wrong

Before any theory, gather what the system already knows about itself. Most diagnoses are sitting in the
logs and the last deploy; guessing skips past them. This skill is **read-only toward the system** —
observing is how you stay the advisor instead of becoming the actor.

Check `.mc/env` first, so you read the right box with the right care.

## The five reads
| What | Where to look |
|---|---|
| **Logs** | `docker compose logs --since 15m`, `journalctl -u <svc> --since "15 min ago"`, `kubectl logs <pod> --tail=200` |
| **Resources** | `top` / `htop`, `df -h` (disk), `free -m` (memory), `docker stats`, open FDs — is anything pinned at 100%? |
| **Health** | `curl -sS localhost/health` (and `/ready`) — does the app say it's up, and do its dependencies answer? |
| **Recent deploys** | `git log --oneline -5` on the deployed rev — *what changed just before this started?* Usually the answer is here. |
| **Error rate** | the error tracker, or grep the logs for the error over time — is it spiking, flat, or already falling? |

Start with **recent deploys**: correlation with a deploy time is the single fastest lead. "It broke at
14:00, we shipped at 13:58" closes more incidents than any log grep.

## Read broad, then narrow
1. Is the **process** even up? (health, `ps`, pod status)
2. Is a **resource** exhausted? (a full disk and out-of-memory are the two most common silent killers)
3. What do the **logs at the failure time** say? (grep the window, not the whole file)
4. What **changed** just before? (a deploy, a config, traffic, a dependency)

## The predicate rule — no observability is itself a finding
**If the project has no observability at all — no logs you can query, no health endpoint, no metrics — that
is a `high` finding. File it before proceeding.** You are flying blind, and that blindness is the first
thing to fix, not something to work around. Write it under the findings path per `docs/FINDING-SPEC.md`
(severity `high`, status `open`): a system you cannot observe is a system you cannot safely operate.

## Hand off what you found
Observation feeds the next skill: a spike after a deploy → `ops-rollback`; an active outage → `ops-incident`
with the timeline seeded from what you saw; a resource trend with no incident yet → a finding for later.
Report numbers and log lines, never impressions — "disk 100% on /var since 13:40", not "seems unhealthy".

---
*Pairs with `ops-incident` (which opens by observing) and `ops-env-map` (know the box first). Credits: the
"read the telemetry before you theorize" discipline from standard SRE monitoring practice.*

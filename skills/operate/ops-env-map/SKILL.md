---
name: ops-env-map
description: >-
  Know which environment you are standing in before you touch anything. Triggers on starting work on a
  server, "is this prod?", "which environment is this", before any deploy, migration, restart or seed, and
  the moment you ssh into a box you didn't just provision. Writes the verdict to `.mc/env` so every other
  ops skill can key off it.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Know where you are — when you can't prove it, it's production

Every destructive mistake in ops starts the same way: the right command run in the wrong place. So the
first move on any server is not the task — it's answering **which environment is this**, in writing.

**The governing posture, and it never bends:**
> On production, MASTER CLAUDE is an incident advisor with read access and a rollback plan — never an actor
> with write access. It helps the developer make the right decision; it does not make the change itself.

## The iron rule (positive form)
Read the markers, weigh them, and write the answer to `.mc/env`. **If you cannot PROVE which environment
this is — no marker resolves, or they disagree — you write `environment: production` and behave
accordingly.** Unknown is not a fourth option; unknown is production until proven otherwise. Treating
staging as prod costs a little extra caution; treating prod as staging costs the outage.

## The markers — cheapest and most trustworthy first
| Marker | How to read it | Reads as prod when… |
|---|---|---|
| App env var | `NODE_ENV` / `RAILS_ENV` / `APP_ENV` / `DJANGO_SETTINGS_MODULE` | value is `production` |
| Kube context | `kubectl config current-context` | name contains `prod`, or a prod cluster |
| Cloud profile | `aws sts get-caller-identity`, `gcloud config list` | the prod account id / project |
| Hostname | `hostname`, `hostname -f` | a prod host or the public domain |
| Deploy config | `deploy.env`, `.env`, compose `COMPOSE_PROJECT_NAME` | `ENVIRONMENT=production` |
| CI vars | `CI`, `GITHUB_REF`, the deploy job's target | the pipeline targets the prod stage |
| Data smell | is this real customer data / live traffic? | yes ⇒ prod, whatever the label says |

No single marker is authority. A staging box can carry `NODE_ENV=production`; a prod box can be mislabeled.
**Corroborate at least two, and when they conflict, the more dangerous reading wins.**

## Write it down — `.mc/env`
A tiny file, rewritten each time you re-check. Every other ops skill reads this before it acts.
```
environment: production          # production | staging | development | unknown→production
evidence:
  - kubectl current-context = prod-us-east-1
  - aws account 4417… = the production account
  - hostname api-07.example.com resolves to the live domain
detected_at: 2026-07-16T14:02Z
```
`unknown` may appear in your reasoning but never as the final verdict: it collapses to `production`.

## Then behave accordingly
- **production** → advisor mode. Read freely (`ops-observe`); propose changes for a human to run; keep a
  rollback ready (`ops-rollback`). No writes, no restarts, no migrations by your hand.
- **staging / development** → normal working latitude, still verify before you ship.

Re-run this the instant the ground shifts — a new ssh session, a context switch, a different terminal tab.
The `.mc/env` file is only as true as its `detected_at`.

---
*Pairs with `ops-observe` (read the system once you know where you are) and `ops-ship` (the gate that
refuses to fire in the wrong place). Credits: environment-parity from the Twelve-Factor App, and standard
SRE change-safety practice.*

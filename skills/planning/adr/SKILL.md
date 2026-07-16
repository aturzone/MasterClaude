---
name: adr
description: >-
  Architecture Decision Records — capture a hard-to-reverse choice while the reasons are fresh. Triggers on
  "why did we choose", "record this decision", "ADR", picking a database, framework, protocol, auth model,
  or API shape, or any fork where reversing the choice later would cost more than a day. One short file per
  decision, so the next person inherits the reasoning, not just the result.
allowed-tools: Read, Grep, Glob, Write, Edit
---

# ADR — write down the decision while you still remember why

Code shows *what* you built; it never shows *what you rejected and why*. Six months on, someone stares at a
choice, can't see the constraints that forced it, and "fixes" it — reintroducing the exact problem it
solved. An ADR is the cheapest insurance against that: one short file, written once, at the moment of
choosing.

## The trigger — keyed to reversibility
**If reversing this choice later would cost more than a day, it gets an ADR.** That's the whole test. A
database engine, an auth model, a public API shape, a sync-vs-async boundary, a build tool the whole repo
leans on — one-way-ish doors. Naming a variable or picking a lint rule is not; skip those. (For a finer
gate: write one when the choice is *hard to reverse*, would *surprise a future reader*, and was a *real
trade-off* with live alternatives.)

## The file — `docs/adr/NNNN-<slug>.md`
Numbered monotonically, one decision per file: `docs/adr/0007-postgres-over-dynamo.md`.
```markdown
# 0007 — Postgres over DynamoDB for the primary store

## Status
accepted        <!-- proposed | accepted | superseded-by-0012 -->

## Context
The forces, in prose. What's true that constrains us — the workload, the team's experience, the
consistency needs, the deadline, the alternatives on the table. Enough that a stranger feels the
squeeze you felt. No decision yet, just the pressure.

## Decision
One sentence, active voice: "We will use Postgres as the primary datastore."
The choice stated plainly — not "it was decided that Postgres might be used".

## Consequences
Both directions are required — an ADR that lists only upsides is marketing, not a record.
- **Easier:** relational queries, transactions, one datastore to operate, the team already knows it.
- **Harder:** we own sharding when we outgrow one box; no free global replication.
```

## The four rules
- **Decision is one sentence, active voice.** If it takes a paragraph, it's two decisions — split them.
- **Both consequence directions, always.** What gets *easier* and what gets *harder*. The honesty of the
  ADR lives in the "harder" list; omit it and no one trusts the rest.
- **Status is a lifecycle, not a label.** `proposed` while debated → `accepted` when chosen. Never edit a
  decided ADR to reverse it: write a **new** ADR and mark the old one `superseded-by-NNNN`. The trail of
  superseded records *is* the architecture's history.
- **Immutable once accepted.** An ADR records what was true then, not a living doc. Supersede; don't rewrite.

---
*Pairs with `grill-me` (whose ADR-gate flags the decision worth recording) and `cap-write-plan` (the plan
that acts on it). Credits: the ADR format is Michael Nygard's; the reversibility gate echoes the
one-way / two-way door heuristic.*

---
name: ops-rollback
description: >-
  Revert a bad deploy, by deploy shape. Triggers on "roll back", "revert the deploy", "the deploy broke
  it", "undo the release", or right after `ops-incident` picks rollback as the stabilizing lever. Covers the
  shape you actually shipped — git, tag, image, or flag — and the one-way door that is a schema migration.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Rollback — know the revert before you need it

A rollback plan is only real if it names the exact command for the shape you actually deployed, and you
know what it costs. On production you write the plan and hand it to a human to run — you don't revert prod
yourself.

## The revert by deploy shape
| Deploy shape | Revert command | Takes effect in | You lose |
|---|---|---|---|
| Git-based deploy | `git revert <sha>`, then redeploy | a full deploy cycle | nothing — history is preserved |
| Tagged release | redeploy the previous tag (`v1.4.1`) | a deploy cycle | any good change that shipped in the bad release too |
| Container image | repoint to the previous image digest, roll pods | seconds–minutes | nothing, if the old image is retained |
| Feature flag | flip the flag off | seconds | only what was behind the flag — the cheapest revert there is |
| Config / env | restore the previous value, reload | seconds–minutes | nothing, if you saved the old value |

The lesson of the table: **the further left you deployed, the slower and coarser the revert.** This is why
`ops-ship` pushes flags and canaries — they turn a deploy-cycle rollback into a one-second flip.

## The one-way door — schema migrations
Code rolls back. **Schema does not.** A migration that dropped a column or rewrote data has already
destroyed the thing the old code needs; redeploying the old release onto the new schema is a *second*
outage. So keep migrations reversible **by design**.

**Expand / contract** — never change a column in place:
1. **Expand.** Add the new column/table; backfill. The old code ignores it; nothing breaks.
2. **Migrate the code.** Ship code that writes both and reads new — it works against *either* schema, so
   the deploy is rollback-safe the whole time.
3. **Contract.** Only after the new code is proven in prod do you drop the old column — a separate, later
   deploy. Now the risky, irreversible step stands alone, long after the code that needed it settled.

Kept this way, every deploy is revertible: the schema always supports both the old and new code at once.

## "The migration already ran and we must go back"
This is the genuinely hard case, and it is **a decision for a named human, never for the agent** — because
every option loses data:
- **Restore from backup** — return to the pre-migration snapshot. You lose every write since the backup.
- **Point-in-time recovery** — replay the WAL to a chosen instant. You lose everything after that instant.
- **Write a forward-fixing migration** — if the old data is derivable, migrate *forward* out of the bad
  state instead of back. Often the least-lossy path.

The agent's job here is to lay out the options, quantify the **data window each one loses**, and surface
the reversibility trade — then a human with the authority to accept data loss makes the call and runs it.

---
*Pairs with `ops-ship` (which required this plan as slot 3) and `ops-incident` (which calls the rollback).
Credits: expand/contract from the parallel-change / evolutionary-database pattern (Sato, Fowler).*

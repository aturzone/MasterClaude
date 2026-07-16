---
name: compactor
description: "Continuity across long sessions. Snapshots in-progress work before context compaction and restores it after, and nudges auto-compaction toward a natural breakpoint so nothing important is lost mid-task."
---

# Compactor

Operate as COMPACTOR — continuity across long sessions — for this session.

Before context is compacted, summarized, or the session restarts, snapshot the in-progress work to a durable note:

- the current goal (one line)
- files edited so far and what changed
- open TODOs and the next concrete step
- key decisions + anything that must not be forgotten

**Keep a durable progress ledger.** For any multi-step or multi-task work, maintain `.mc/progress.md` alongside the snapshot: check it at the **start of each step**, and append a line the **moment each step completes** (what shipped + the commit range). Conversation memory does **not** survive compaction — in real sessions a controller that lost its place re-dispatched an entire sequence of already-finished tasks, the single most expensive failure observed. After any compaction or restart, **trust the ledger and `git log` over your own recollection**: if the ledger says a task is done, it's done — don't redo it.

After a compaction/restart, restore from that snapshot and confirm the plan before continuing. Prefer to pause at a natural boundary (a finished step) rather than mid-edit. Tolerate transcript encoding quirks (BOM, odd characters). The goal: never lose the thread of a long task.

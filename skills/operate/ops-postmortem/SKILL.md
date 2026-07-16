---
name: ops-postmortem
description: >-
  The blameless post-mortem that closes the loop after an incident. Triggers on "post-mortem", "how did
  this happen", "how do we prevent this", a retro after any outage, or a failure that has now recurred.
  Turns a timeline into contributing causes, action items with owners, and one concrete artifact that would
  have caught it — built, not admired.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Post-mortem — blameless, and it ends in a built guardrail

The point of a post-mortem is not to explain what happened; it's to make this class of failure *impossible
or loud next time*. It is **blameless**: the target is the system that let the error through, never the
person who made it. A blaming post-mortem teaches people to hide incidents — the opposite of what you need.

Write it to `.mc/postmortem-<date>.md`, built from the `ops-incident` timeline.

## The required sections
1. **Timeline.** Lifted from `.mc/incident-<date>.md` — detection, each action, when service was restored.
   Facts with timestamps, no editorializing.
2. **Contributing causes.** Plural, and never "human error." A person clicking the wrong thing is a
   *symptom*; the cause is **what made the wrong thing easy** — no confirmation step, no environment check,
   a deploy tool that hid the target, two prod hosts one letter apart. Keep asking "what let that happen?"
   until you reach something you can change in the system.
3. **What worked / what didn't.** Both, honestly. The rollback that saved you and the alert that never
   fired are equally worth naming.
4. **Action items — each an owned, tracked finding.** Every fix becomes a finding/issue (per
   `docs/FINDING-SPEC.md`) with a **named owner** and a severity — not a bullet in a doc nobody reopens. An
   action item with no owner is a wish.

## The section that makes it worth doing
**"What would have caught this?" must name a concrete artifact** — not a resolution to be more careful:
| The gap was… | The artifact that gets built |
|---|---|
| a bad value reached prod | a **test** or validation that rejects it |
| a dangerous action had no guard | a **guardrail** or a `permissions.deny` rule the developer installs |
| an invariant silently broke | a **Sentinel invariant** / check that fails when it's violated again |
| nobody noticed until users did | an **alert** on the metric that moved first |

Then **the artifact gets built** — it's an action item with an owner, like any other. "We'll be more
careful" is not an artifact; being careful has never once caught the second occurrence. A post-mortem whose
prevention column is aspirations is one you'll rewrite verbatim after the next incident.

## The recurrence test
If this failure has happened before, the last post-mortem's artifact either wasn't built or didn't fire.
Say so plainly, and fix *that* — a guardrail that was written but never installed is its own finding.

---
*Pairs with `ops-incident` (the timeline it consumes) and `ops-observe` (where the missing alert lands).
Credits: the blameless post-mortem and "human error is never a root cause" from Allspaw and Google SRE.*

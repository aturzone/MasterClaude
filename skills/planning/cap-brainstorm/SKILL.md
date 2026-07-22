---
name: cap-brainstorm
description: >-
  Brainstorm an idea, problem, or design as a sharp thinking partner — diverge wide, then converge on a
  decision. Triggers on "brainstorm", "ideate", "what should we build", "explore options/approaches",
  "help me think through", or before any open-ended design/architecture choice. One question at a time,
  many genuinely different options (not the first idea), then a recommended call with the runner-up and
  what would change it. Ends with a written artifact, not just chat.
allowed-tools: Read, Grep, Glob, Bash, Task
---

# Brainstorm — diverge wide, then decide

Open-ended problems die two ways: grabbing the first idea, or dithering forever. This skill does neither —
it widens the space, then commits. And **no project is "too simple to need a moment of design"** — that's
exactly where an unexamined assumption wastes the most work. Brainstorm anyway, briefly.

## 1. Frame
State the real question + the constraints in one or two lines. Explore the repo/context first (grep/read)
so the brainstorm is grounded, not abstract. If the goal itself is fuzzy, run **grill-me** first.

## 2. Diverge (no judging yet)
Generate **many genuinely different** options — deliberately vary the axis: the safe one, the bold one, the
sideways/weird one, the do-less one, the buy-don't-build one. Quantity and *variety* first; don't critique
mid-flow. For a rich space, spawn **parallel Task subagents** to ideate independently from different angles,
then merge — diversity beats one train of thought. Cluster the results into a few named themes.

## 3. Evaluate
Score the themes against the criteria that matter *here* — usually **impact · effort · risk ·
reversibility** (add domain ones: latency, cost, UX, maintenance). Be explicit about the trade-offs; name
the assumptions each option rides on.

## 4. Converge — make the call
- **Recommend one**, with a one-line why.
- Give the **runner-up** and **what would change your mind** (the signal that would flip the decision).
- **Reversibility sets the pace:** cheap to undo → decide now and move; one-way door (data loss, public
  release, money, a hard-to-reverse architecture choice) → slow down, widen the options, bring the user in.

## 5. Hand off — an artifact, not just chat
End with a short written outcome: the decision, the options considered, the rejected ones + why, and the
open risks. Before you save it, **scan it once** for unresolved TBDs, internal contradictions, and scope
that won't fit one plan (if it spans independent subsystems, stop and **cap-decomposer** first). Save it
(`.skull/decisions.md` or a design note). **Gate:** don't pass it to **cap-spec-smith** /
**cap-plan-first** / any build skill until the user gives an explicit yes on the decision. A brainstorm
that vanishes into chat history — or slides into code unapproved — was half-wasted.

Be a sparring partner, not a yes-man: push back, surface the option the user didn't consider, and say when
their favorite is the wrong call — with the reason.

---
*Credits:* the Socratic, design-before-code brainstorming discipline is a hallmark of **superpowers**
(`obra/superpowers`, MIT). See `docs/ECOSYSTEM.md`. Pairs with **grill-me** (before) and **cap-spec-smith** /
**cap-plan-first** (after).

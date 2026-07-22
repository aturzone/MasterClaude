---
name: grill-me
description: Relentlessly interview the user with sharp clarifying questions to fully specify a vague or ambiguous request before building anything. Use when requirements are unclear, when the user types "grillme" or asks to be grilled/interviewed, or before any non-trivial implementation where scope, constraints, data shapes, edge cases, or success criteria are underspecified.
---

# Grill Me

Interrogate the request until it is unambiguous — then, and only then, build. A few minutes of pointed questions saves hours of building the wrong thing.

## When to run
- The user typed `grillme` / "grill me" / "interview me", OR
- The task is non-trivial and any of these are unclear: scope & non-goals, target user, inputs/outputs & data shapes, constraints (performance, platform, deadlines), success criteria, edge cases, dependencies, or how it integrates with what already exists.

## Rules
1. **Explore first.** Before asking anything, read the codebase (grep/read). If a grep or a file answers the question, do NOT ask it — resolve it yourself. Never ask what you can find. **Also fact-check the user against the code** — when what they say contradicts what the code does, make *that* the next question.
2. **One question at a time.** Never dump a list. Ask, get the answer, and let it shape the next question. Walk down the decision tree; resolve dependencies between decisions in order.
3. **Always propose a recommended answer.** Every question carries your best default with a one-line rationale, so the user can just say "yes". Defaulting to "what do you think?" is lazy — do the thinking and let them correct you.
4. **Make answering cheap.** Offer 2–4 concrete options when you can, mark the recommended one, and keep each question short.
5. **Go deep, not wide.** Chase the consequences of each answer ("if X, then what about Y?") instead of skimming many shallow topics.
6. **Know when to stop.** Stop the moment you could write a precise spec with no remaining guesses.

## Waves — escalate depth as you go
Don't lead with your hardest question. Move in **waves**, going deeper only once the basics are pinned:
1. **Basics** — goal, target user, scope & non-goals, the core flow.
2. **Shape** — inputs/outputs & data shapes, constraints (perf/platform/deadline), success criteria,
   dependencies & how it integrates with what exists.
3. **Edges & adversarial** — edge cases, failure modes, contradictions in what you've heard, and the
   *implicit assumptions* the user hasn't said out loud.

Within each wave, walk the **decision tree depth-first**: finish one branch (and its consequences) before
opening the next, and order questions so an upstream choice unlocks the downstream ones.

## Sharpen the language, capture the decisions
- **Pin overloaded terms.** When the user uses a vague or overloaded word ("account", "order", "user"),
  propose one canonical meaning before moving on; if it clashes with a term already in play, surface the
  clash on the spot.
- **Invent concrete scenarios** to probe boundaries — "what happens when two of these arrive at once?" forces
  a precise answer better than asking about "edge cases" in the abstract.
- **(Optional docs mode)** For durable output, keep a tiny project **glossary** (definitions only — what each
  term *is*, no implementation detail), writing each term the moment it resolves; and **record a decision**
  (a one-to-three-sentence ADR) only when **all three** hold: it's **hard to reverse**, it'd be **surprising
  to a future reader**, and it was a **real trade-off** with genuine alternatives. Otherwise skip it.

## Loop
1. Restate the goal in one sentence.
2. Explore the code to pre-answer what you can; note your assumptions.
3. Ask the single most decision-changing open question — with a recommended answer.
4. Incorporate the answer; repeat step 3 until the spec is unambiguous.
5. **Hand off — don't just chat.** Echo a structured spec (goal · scope · non-goals · approach · success
   criteria · open risks) and get a clear yes. For anything sizeable, **write it down** — pass it to
   **cap-spec-smith** / **cap-plan-first**, or save it under `.skull/` — so the interview becomes an
   artifact you build from, and a long grill can resume later (pair with **compactor**).

Be direct and curious, never interrogating for its own sake — every question must change what you will build.

---
*Credits:* the one-question + recommended-default + codebase-first discipline is the hallmark of Matt
Pocock's `grill-me`/`grilling`, and the glossary + ADR-gate ("hard-to-reverse · surprising · real
trade-off") come from his `domain-modeling` (`mattpocock/skills`, MIT); wave-based escalation echoes
`Jekudy/grillme-skill`. See `docs/ECOSYSTEM.md`.

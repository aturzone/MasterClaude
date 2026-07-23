---
name: codescribe
description: >-
  Capture the *why* after a change — the non-obvious knowledge a future developer or agent can't
  recover by reading the code: hidden constraints, business rules, rejected alternatives, edge-case
  guards, invisible API contracts, and what silently breaks if the code changes. Triggers on
  "document this", "write docs for what we built", "capture why this exists", "document the
  constraints/decisions", "preserve this for future devs" — after a feature, refactor, or bug fix.
  NOT for README, API docs, code comments, or CHANGELOG — only the knowledge the code can't tell you.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# codescribe — write down what the code can't tell you

After a change ships, the expensive knowledge is already in your head and about to evaporate: *why* the
logic exists, what it assumes, what breaks if it moves. `codescribe` captures that — not a summary of what
the code does (the code shows that), but the intent a reader can't reconstruct. The write-side companion to
`codehistorian` (which mines the *why* from git); this one records the *why* while you still have it.

## The one test
Before writing any sentence, ask: **could a developer recover this by reading the code for two minutes?**
- **Yes** → don't write it. (No "this function calls the checkout API.")
- **No** → write it. ("Must run *after* cart validation — the API doesn't re-check and will accept an empty cart, creating a zero-total order.")

## Shallow → intent (write the right column)
| Shallow — skip | Intent — keep |
|---|---|
| "Returns the user's display name." | "Falls back to the email prefix when `firstName` is null — legacy accounts created before the name field existed have only an email." |
| "Fetches products." | "Uses `no-store` because pricing is real-time — CDN-cached responses caused a checkout price-mismatch incident." |
| "Checks the form is valid." | "Blocks submit when `items.length === 0` even if every field is filled — a zero-item order passes backend validation but breaks fulfillment downstream." |
| "Reacts to route changes." | "Clears form state on navigation because the store isn't reset on back-nav — without this, a previous session's input bleeds into a new one." |

## What counts as non-obvious
Knowledge that needs something *outside* the file to understand: git history or a ticket · a prior
incident / production bug · a backend contract invisible in the source · a business rule only ever said
aloud · a guard for a real but rare edge case · why an alternative was rejected.

## Extract it (per changed file)
Work the change and ask:
1. What would surprise a newcomer reading this?
2. What took *you* longest to understand?
3. What did you have to verify by reading other files or asking someone?
4. What decision did you make that the code doesn't explain?
5. What edge case turned up that wasn't in the spec?
6. What would break if someone refactored this without knowing it?
7. What does this assume about the API / global state / route that it doesn't validate here?

Group the answers into: **why it exists · why this approach (what was rejected) · edge cases guarded ·
assumptions relied on · what breaks if changed.**

## Where it goes
Write to **`.skull/context/<ModuleName>.md`** — named for the module, not the path
(`src/pages/checkout.vue` → `checkout.md`; a multi-file feature → `checkout-flow.md`). Point your
`AGENTS.md` / `CLAUDE.md` at `.skull/context/` so every agent loads it *before* planning — that's the whole
point: the next session starts with the knowledge, not without it.

- **Get the developer's OK before writing or updating a file.**
- **Merge, don't overwrite.** Read the existing doc first, merge section by section, keep what's still true,
  and **flag** where the current code now contradicts what's written — never silently drop it.
- Omit any section you have nothing real for. No empty headings, no filler.

## End with Confidence & Gaps
`Confidence: High | Medium | Low` · assumptions made · what you deliberately left out · context still needed
(when Medium/Low). High = intent and constraints are clear from code + context; Low = critical production
behavior or callers unknown — say what would change the doc.

---
*Distilled from a production documentation methodology by **Atur Dana** and a collaborator, generalized for
any stack. Companions: `codehistorian`, `repo-map`, `fe-refactor`.*

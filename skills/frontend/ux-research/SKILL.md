---
name: ux-research
description: >-
  Decide what to build before deciding how it looks. Triggers on a new product, feature or redesign, on "who is
  this for", "what should this screen do", "users are confused / churning / not converting", on vague briefs
  ("make a dashboard"), and before any information-architecture or navigation decision. Produces the user, the
  job-to-be-done, the primary flow, and the one thing each screen must accomplish — the brief the rest of the
  design team builds against.
allowed-tools: Read, Grep, Glob, Write, Edit
---

# UX research — the brief before the pixels

The most expensive frontend mistake is a beautifully built screen nobody needed. Before tokens, before layout:
know who is on the other side and what they came to do.

## Start here — five questions
| Question | Bad answer | Good answer |
|---|---|---|
| **Who** is this for? | "users" | "an ops lead who lives in this tab 6h/day, on a 1440p monitor" |
| What **job** are they hiring it for? | "manage data" | "spot the one broken order before the customer calls" |
| What's the **primary flow**? | "they navigate the app" | "open → scan for red → drill in → resolve → back to list" |
| What does **success** look like? | "good UX" | "time-to-spot under 5s; zero missed criticals" |
| What's the **context**? | "on a browser" | "second monitor, glanced at, often interrupted" |

If the brief can't answer these, **ask** — `grill-me` is the sharper tool for extracting it. Don't invent a
persona and quietly design for it; a fabricated user is worse than an admitted unknown.

## One screen, one job
Each screen gets **one** primary job, stated in a sentence. Everything else on it is secondary and should look
secondary. A screen with three co-equal jobs is three screens, or a screen nobody understands.

## Map the flow before the layout
Write the steps as a list, then count them. The wins are almost always **removal**:
- a step that exists only because the backend is shaped that way
- a confirmation nobody reads
- a form field that could be inferred, defaulted, or asked later
- a decision the user can't yet make with what's on screen

`decomposer` helps split a large flow. `cap-rubber-duck` helps when the flow feels wrong but you can't say why.

## Information architecture
Group by **the user's mental model**, not your database schema. Table names are not navigation.
- Nav breadth over depth — 5–7 top items; deep trees hide things.
- Name things the way users say them out loud.
- The current location must be obvious without reading.
- Every item earns its slot: if it's used monthly, it's not top-level.

## Then hand off
Output a short brief — user · job · flow · success metric · per-screen job — and hand it to **`ui-intel`** for
the visual system and **`fe-page-patterns`** for the layout. Persist it next to the design system at
`.skull/design/BRIEF.md` so the next session inherits the *why*, not just the hex codes.

## Evidence beats opinion
If there's real signal in the repo, read it before theorizing: analytics events, support tickets, error logs,
funnel drop-off, session replays, existing user docs. One real complaint outranks an hour of speculation —
and outranks your taste.

---
*Pairs with `grill-me` (extract the real requirement), `ui-intel` (the visual system), `fe-page-patterns`
(layout). See docs/ECOSYSTEM.md.*

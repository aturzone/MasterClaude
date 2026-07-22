---
name: wf-ui-uplift
description: >-
  Run a full design pass over a product — establish who it's for, generate and persist a real design system,
  rebuild the UI against it, then review front-to-back and report what changed. Use when a whole frontend
  needs to go from generic to designed: a redesign, a pre-launch polish, "make this look professional", "our
  UI looks AI-generated", or a new product with no visual system. For one page or one component, use the
  focused fe-* skill instead.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Workflow: full UI/UX uplift

Drive a complete design pass over a product and leave behind a system, not a one-off pretty page. This is the
comprehensive service; for a single screen use `fe-page-patterns`, for one component `fe-component-craft`.

**Scope:** everything the user sees. Work in passes, and keep a **coverage ledger** — which screens were
rebuilt, which were reviewed only, which were skipped and why. An uplift that silently touched 3 of 20 screens
and reported success is a lie; say what you actually covered.

## Passes

1. **Brief** — `ux-research`. Who is this for, what job, what's the primary flow, what does each screen have to
   accomplish? If the answers aren't in the repo or the request, **ask** (`grill-me`) — do not invent a
   persona. Persist to `.skull/design/BRIEF.md`.

2. **Inventory.** Enumerate every screen, component and state that exists today. Note the stack (detect it —
   never assume), the existing tokens or lack of them, and the component library already in use. This frames
   the whole uplift and sizes the work honestly.

3. **System** — `ui-intel` + `fe-design-system`. Generate the design system for this product type and
   **persist it**:
   ```bash
   node <ui-intel>/uikit.mjs --design-system "<product> <industry>" --stack <detected> \
        --persist --out <project-root> -p "<Name>"
   ```
   → `.skull/design/MASTER.md`. If it already exists, **read it and keep it** — a prior human decision outranks a
   fresh generation. Emit the tokens once, as CSS variables or a Tailwind config.

4. **Layout** — `fe-page-patterns`. Per screen, apply the proven structure for its type (landing, dashboard,
   settings, auth, pricing, table, form, detail, empty/error/loading). Page-specific deviations go in
   `.skull/design/pages/<page>.md`, not into a forked MASTER.

5. **Build** — `fe-component-craft`. Rebuild components against the tokens: every state
   (`hover · focus · active · disabled · loading · empty · error`), responsive 360→1440, accessible by
   construction. Reuse shadcn/Radix rather than hand-rolling a combobox.

6. **Motion** — `fe-motion`. Add only motion that explains something. Ship `prefers-reduced-motion` in the same
   pass that adds the animation, never later.

7. **Review** — `fe-design-review` + `fe-a11y` + `fe-perf`, in that order of severity. Walk the `ui-intel`
   priority ladder; a band-1 accessibility miss is a blocker regardless of how good it looks.

8. **Report** — `skull-dashboard`. Regenerate `skull.html` so the design team's output lands next to QA and security
   in one place:
   ```bash
   node <skull-dashboard>/skull-dashboard.mjs
   ```

## Parallelism
Passes 4–6 are per-screen and independent — fan them out with `subagent-orchestration` once the system in pass
3 is fixed, and escalate to `fleet` for a large surface. **Do not parallelize before pass 3 lands**: agents
building against different design systems produce a patchwork, and reconciling it costs more than the time saved.

## Verdict
Finish with: screens covered / reviewed / skipped · findings by severity · the single highest-impact fix
remaining · and whether this is shippable. Be honest about "looks better" vs "is better" — if the a11y band
still has blockers, it is not shippable, whatever the screenshots suggest.

---
*Members: `ux-research` · `ui-intel` · `fe-design-system` · `fe-page-patterns` · `fe-component-craft` ·
`fe-motion` · `fe-design-review` · `fe-a11y` · `fe-perf` · `skull-dashboard`. Run by the `designer` agent or
`/skull:design`.*

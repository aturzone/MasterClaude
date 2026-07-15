---
name: ui-intel
description: >-
  Design intelligence — the concrete picks, not just the taste. Queries a local database of product types,
  color palettes, UI styles, font pairings and UX rules, and returns an actual design system: real hex tokens,
  a named style, a font pairing, decision rules and the anti-patterns to avoid. Triggers at the START of any
  UI work — a new page, app, landing page, redesign, component library — and on "what colors / font / style
  should this use", "make it look designed, not generic", or "it looks AI-generated". Persists the result to
  .mc/design/MASTER.md so every later session builds the same product.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# ui-intel — design intelligence, with the specifics

Taste alone produces "use a restrained accent and a modular scale" — true, and useless at 2am. This skill
answers with **`#2563EB`**, **Geist + Inter**, **"don't put glass behind a data table"**. It reads a curated
local database and returns a design system you can paste.

## When to apply
Any task that changes how something **looks, feels, moves, or is interacted with** — a new page or app, a
redesign, a component library, or a "why does this look generic" complaint. Run it **before** writing UI, not
after. Skip it for backend logic, APIs, infra, and non-visual work.

## Step 1 — detect the stack. Never assume it.
Read the repo: `package.json` (react · next · vue · nuxt · svelte · astro · @angular), `pubspec.yaml` (Flutter),
`*.xcodeproj` / `Package.swift` (SwiftUI), `composer.json` (Laravel), `app.json` + `react-native`.
If nothing is detectable, **ask**. A hardcoded default silently misroutes every recommendation that follows.

## Step 2 — get the design system
```bash
node <skill-dir>/uikit.mjs --design-system "<product type> <industry> <keywords>" [--stack next] [-p "Name"]
```
Returns: layout pattern · style · a full palette (light + dark, shadcn-shaped) · font pairing · signature
effects · decision rules · anti-patterns · a pre-delivery checklist.

```bash
# a worked example
node uikit.mjs --design-system "beauty spa wellness booking" -p "Serenity"
```

Narrower questions:
```bash
node uikit.mjs --domain palettes "fintech trust"      # products | palettes | styles | fonts | ux-rules
node uikit.mjs --list styles
node uikit.mjs --contrast "#64748B" "#F1F5F9"          # ratio + AA/AAA verdict for any pair
```

## Step 3 — persist it, so session #2 builds the same product
```bash
node uikit.mjs --design-system "<query>" --persist --out <project-root> -p "Name" [--page dashboard]
```
Writes `.mc/design/MASTER.md` (the source of truth) and `.mc/design/pages/<page>.md` (overrides that win over
MASTER for that page only).

**Read MASTER.md before regenerating it.** An existing file is left untouched unless you pass `--force` —
that file may hold decisions a human made deliberately, and silently overwriting them is the one unforgivable
move here. When a page genuinely needs to deviate, write a page override; don't fork MASTER.

Later sessions: read `.mc/design/MASTER.md` → read `pages/<page>.md` if it exists → build. No re-litigating
the palette every time.

## The priority ladder — what to fix first
Work top-down; a beautiful inaccessible button is a broken button.

| # | Category | Impact | Must have | Anti-pattern |
|---|---|---|---|---|
| 1 | Accessibility | critical | 4.5:1 text, alt text, keyboard reachable, visible focus, labels | `outline: none`, icon-only buttons with no name |
| 2 | Touch & interaction | critical | 44×44 targets, 8px gaps, feedback <100ms | hover-only menus, 0ms state changes |
| 3 | Performance | high | WebP/AVIF, lazy below the fold, reserved space (CLS <0.1) | layout jumping when data lands |
| 4 | Style coherence | high | one system, SVG icons | emoji as icons, three styles at once |
| 5 | Layout & responsive | high | mobile-first, no horizontal scroll | fixed px containers, `user-scalable=no` |
| 6 | Typography & colour | medium | 16px base, 1.5 line-height, semantic tokens | 12px body, grey-on-grey, raw hex in components |
| 7 | Motion | medium | 150–300ms, meaningful, `prefers-reduced-motion` | decorative-only, animating `width`/`height` |
| 8 | Forms & feedback | medium | visible labels, errors at the field | placeholder-as-label, errors only at the top |
| 9 | Navigation | high | predictable back, ≤5 bottom items, deep links | overloaded nav, broken back |
| 10 | Charts & data | low | legends, tooltips, accessible series | colour as the only channel |

Full rule text: `node uikit.mjs --domain ux-rules "<topic>"`.

## Contrast is verified here, not claimed
Every palette in the database is checked by `uikit.mjs --check`, which computes real WCAG 2.2 ratios over all
nine token pairs in **both** light and dark mode and exits non-zero on a violation. A palette that ships is a
palette that passed. Use `--contrast` on your own colors before defending them.

---
*Feeds `fe-design-system` (tokens), `fe-page-patterns` (layout), `fe-component-craft` (build) and
`fe-design-review` (the ladder above, as a review). Inspired by the excellent
[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT) — the idea of a queryable design
database is theirs; this data is our own. See docs/ECOSYSTEM.md.*

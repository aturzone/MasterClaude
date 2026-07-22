---
name: fe-design-system
description: >-
  Set the design foundation before building any UI, so the output looks designed, not default. Triggers when
  starting a new frontend, a redesign, a landing page, or a component library, and on "make it look
  good/professional", "it looks generic / like Bootstrap / AI-generated", or any UI work with no established
  visual system. Establish or detect design tokens (color, type scale, spacing, radius, shadow, motion), a
  font pairing, and a component vocabulary — reusing shadcn/Radix/Tailwind conventions — before writing components.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Frontend design system — set the foundation first

Default-looking UI is the #1 tell of AI-generated frontend. Before building components, establish the system
they share.

## Order of operations
1. **Does one already exist?** Read the repo first — `.skull/design/MASTER.md`, then the CSS / Tailwind config /
   token file / theme provider. **Never fight a system that's already there.** Only invent what's missing.
2. **Get the concrete picks** — `ui-intel` turns "a spa booking app" into real hex, a named style and a font
   pairing, instead of you inventing a palette from nothing:
   ```bash
   node <ui-intel>/uikit.mjs --design-system "<product> <industry> <keywords>" --stack <detected>
   ```
3. **Persist it** so the next session builds the same product, not a cousin of it:
   ```bash
   node <ui-intel>/uikit.mjs --design-system "<query>" --persist --out <project-root> -p "<Name>"
   ```
   → `.skull/design/MASTER.md` (source of truth) + `.skull/design/pages/<page>.md` (per-page overrides).
   An existing MASTER.md is **kept** unless you pass `--force` — read it before you regenerate it; it may hold
   decisions a human made.
4. **Emit it once**, as CSS variables or a Tailwind/token config the components import. One source of truth.

## The tokens (define once, use everywhere)
| Token | Define | Rule of thumb |
|---|---|---|
| Color | a neutral ramp (bg · surface · border · text/-2/-3) + **one** accent + semantic (success/warn/danger) | pick steps in OKLCH for even contrast; the accent is used sparingly |
| Type scale | a modular scale (~1.2–1.25 ratio): caption → body → h3 → h2 → h1 | body 15–17px; line-height ~1.5 body / ~1.1 headings; `clamp()` for fluid |
| Spacing | a 4px base scale (4 · 8 · 12 · 16 · 24 · 32 · 48 · 64) | a consistent rhythm beats eyeballed margins |
| Radius | 1–2 values (sm/md) + full | sharp = serious, round = friendly — match the brand |
| Shadow | 2–3 elevations, soft + low-opacity | subtle; never a hard near-black box-shadow |
| Motion | 1 easing + 2 durations (fast ~120ms, base ~200ms) | animate `transform`/`opacity`, not layout |

`ui-intel`'s palettes ship in exactly this shape (shadcn token names, light + dark), contrast-verified — so
step 2 usually fills the colour row for you.

## What makes it look designed
- **One accent, restrained.** Color carries meaning; a rainbow reads amateur. Neutrals do the heavy lifting.
- **A consistent spacing rhythm** from the scale — the fastest path from "default" to "designed".
- **Type hierarchy** by size + weight + color together, not size alone.
- **Borders + surfaces** structure a layout better than heavy shadows.
- **Dark mode from the start** as CSS variables — don't bolt it on later.

## Reuse, don't reinvent
Lean on **shadcn/ui** + **Radix** primitives (accessible, unstyled) + **Tailwind** tokens, or the project's
framework (MUI/Chakra/Mantine). For a brand or a named look, the **theme-factory** and **brand-guidelines**
Claude skills apply.

---
*Fed by `ui-intel` (the picks). Pairs with `fe-page-patterns` (what to build) and `fe-component-craft` (how to
build it). Credits: shadcn/ui, Radix, Tailwind; Anthropic theme-factory + brand-guidelines. See docs/ECOSYSTEM.md.*

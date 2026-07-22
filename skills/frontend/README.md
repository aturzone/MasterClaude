# skills/frontend — the design team

SKULL's UI/UX team. Not default-looking AI frontend: a real design org, covering the whole loop —
**know the user → get the concrete picks → set the system → pick the layout → craft the components →
make it accessible, fast and alive → review it.**

The team is driven end-to-end by **`wf-ui-uplift`**, the **`designer`** agent, or `/skull:design`.

## Current members

**Know what you're building**
- **ux-research** — the user, the job-to-be-done, the primary flow, the one job per screen. The brief before the pixels.

**Decide how it looks — with specifics**
- **ui-intel** — ★ the design-intelligence database. Query it for **real** answers: a full palette in hex
  (light + dark, shadcn-shaped), a named style, a font pairing, decision rules, and the anti-patterns to
  avoid — then persist them to `.skull/design/MASTER.md` so every later session builds the *same* product.
  Dep-free Node, no install. Every palette's contrast is **computed and verified**, not claimed.
- **fe-design-system** — turn the picks into tokens (color / type / spacing / radius / shadow / motion).

**Build it**
- **fe-page-patterns** — the proven layout per page type (landing, dashboard, auth, pricing, docs, table, form…).
- **fe-component-craft** — accessible, responsive, every-state components.
- **fe-from-reference** — screenshot / brand / vibe → UI, via Claude artifacts, the visualize widget, or canvas-design.
- **fe-motion** — motion that explains rather than decorates; `prefers-reduced-motion` from day one.

**Make sure it's actually good**
- **fe-a11y** — WCAG 2.2 AA, keyboard, screen readers, focus, contrast. The first gate, not the last polish.
- **fe-perf** — LCP / CLS / INP and bundle size. Measure, then fix the thing that actually costs.
- **fe-design-review** — a picky design pass, severity assigned by the priority ladder (blocker/major/minor).

## The priority ladder
Every reviewer here works top-down: **1** accessibility · **2** touch & interaction · **3** performance ·
**4** style coherence · **5** layout & responsive · **6** typography & colour · **7** motion · **8** forms ·
**9** navigation · **10** charts. A band-1 miss is a blocker however good the page looks.

## Using ui-intel
```bash
node ui-intel/uikit.mjs --design-system "b2b saas dashboard" --stack next -p "Acme"
node ui-intel/uikit.mjs --design-system "beauty spa booking" --persist --out . -p "Serenity"
node ui-intel/uikit.mjs --domain palettes "fintech trust"
node ui-intel/uikit.mjs --contrast "#64748B" "#F1F5F9"
node ui-intel/uikit.mjs --check          # data integrity + every WCAG pair
```
Extending the database = editing `ui-intel/data/*.json`. `--check` must stay green; CI runs it.

## Good next contributions (brainstorm)
data-viz & chart selection · design-to-code from Figma · responsive email (HTML) · i18n / RTL layouts ·
form-UX depth · stack-specific kits (Next.js app-router, SvelteKit, SwiftUI) · more palettes/styles/pairings in
`ui-intel/data/`. Each = `skills/frontend/<id>/SKILL.md` + the stay-in-sync checklist (`docs/ADDING-A-CAPABILITY.md`).

We build on the best — **Claude's own artifacts** + the Anthropic design skills (**canvas-design, theme-factory,
brand-guidelines, algorithmic-art**) — and reuse community systems (**shadcn/ui, Radix, Tailwind**). `ui-intel`'s
architecture is inspired by **[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)** (MIT) —
the idea of a queryable design database is theirs; the data here is our own. Credit upstream; don't vendor.
See **docs/ECOSYSTEM.md**.

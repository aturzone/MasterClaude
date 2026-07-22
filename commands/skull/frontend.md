---
description: Build excellent frontend — pick the right SKULL frontend skills for the page or component (triggers on "build a UI", "design a page", "make it look good", "build this screenshot", "review this UI")
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Task
---
As SKULL, produce great frontend for: $ARGUMENTS

Pick the right `skills/frontend/` members for what's being built — don't ship default-looking UI:
1. **Foundation** — `fe-design-system`: detect or set the tokens (color / type / spacing / radius / shadow /
   motion) **before** building, so the result looks designed, not default.
2. **Layout** — `fe-page-patterns`: start from the proven structure + hierarchy for this page type (landing,
   dashboard, auth, pricing, docs, table, form, …) and always design the empty / loading / error states too.
3. **Components** — `fe-component-craft`: accessible (semantic HTML, ARIA, keyboard, visible focus, contrast),
   every interaction state, responsive (mobile-first, `clamp()`, ≥ 44px targets), and the polish.
4. **From a reference** — `fe-from-reference`: a screenshot / brand / vibe → UI; pick the output channel (a
   Claude artifact, the visualize `show_widget`, or canvas-design / theme-factory / algorithmic-art). Match the
   *style*, never copy others' copyrighted text/images/logos — original assets only.
5. **Review** — `fe-design-review`: a picky design + a11y pass before shipping; findings as blocker/major/minor
   with the fix.

Reuse the best (shadcn/ui, Radix, Tailwind; the Anthropic design skills) — credit, don't vendor. **Verify in a
real preview** when you can, not by eyeballing the code.

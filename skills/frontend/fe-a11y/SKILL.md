---
name: fe-a11y
description: >-
  Accessibility done properly — WCAG 2.2 AA, keyboard, screen readers, focus, contrast. Triggers on "is this
  accessible", "a11y / WCAG / ADA / Section 508 / EAA compliance", an accessibility audit or complaint, a
  failed axe/Lighthouse a11y score, or any custom interactive control (modal, menu, combobox, tabs, drag-drop,
  carousel). Also the first gate before shipping any UI. Returns findings mapped to a WCAG criterion with the
  concrete fix.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Accessibility — the first gate, not the last polish

A beautiful control that a keyboard can't reach is a broken control. Accessibility is priority 1 on the
`ui-intel` ladder for a reason: it's the only category where failure locks someone out entirely.

## The order that finds the most, fastest
1. **Semantics** — is it a real `<button>`, `<a>`, `<label>`, `<nav>`, `<h1..h6>`? Most a11y bugs are a `<div>`
   wearing a costume. A native element brings focus, keyboard, and a role for free.
2. **Keyboard** — Tab through the whole flow. Can you reach everything? Escape a modal? Is focus ever trapped
   or lost to `<body>`? Is the tab order the visual order?
3. **Focus visible** — can you see where you are, on every surface, at 3:1 against its background?
4. **Names** — does every control announce something useful? Icon-only buttons are the usual offender.
5. **Contrast** — text 4.5:1, large text and UI boundaries 3:1.
6. **ARIA** — last, and least. Correct HTML beats clever ARIA every time.

## The rules that catch real bugs
| Rule | WCAG | The thing people actually ship |
|---|---|---|
| No `outline: none` without a replacement | 2.4.7 | focus ring deleted "because it's ugly" |
| Every input has a real `<label>` | 1.3.1 / 3.3.2 | placeholder used as the label — it vanishes on type |
| Icon-only button has an accessible name | 4.1.2 | `<button><TrashIcon/></button>` announces "button" |
| Target ≥ 24×24 CSS px (44×44 recommended) | 2.5.8 | a 16px close button on mobile |
| Contrast: text 4.5:1, UI 3:1 | 1.4.3 / 1.4.11 | grey-on-grey secondary text |
| Nothing conveyed by colour alone | 1.4.1 | red border as the only error signal |
| Images: meaningful `alt`, decorative `alt=""` | 1.1.1 | `alt="image"` on everything |
| Errors identified in text, at the field | 3.3.1 | a red glow and nothing else |
| `prefers-reduced-motion` honoured | 2.3.3 | parallax that makes people sick |
| Page has one `<h1>`, no skipped levels | 1.3.1 | `<h3>` chosen because it looked right |
| Zoom to 200% doesn't break it | 1.4.4 | `user-scalable=no` |
| Dynamic updates announced (`aria-live`) | 4.1.3 | a toast a screen reader never mentions |

## ARIA — the four rules
1. **Don't.** Use the right HTML element.
2. If you must, don't change native semantics (`<button role="heading">` — no).
3. Every interactive ARIA control must be keyboard-operable.
4. Never `aria-hidden="true"` on something focusable — it creates a ghost stop.

For custom widgets (combobox, tabs, tree, dialog), follow the **ARIA Authoring Practices** pattern for that
exact widget — the keyboard interaction is specified, not a matter of taste. Better still: use **Radix** or
**React Aria**, which already implement it.

## Verify, don't vibe
```bash
npx @axe-core/cli <url>            # catches ~35% of issues — necessary, nowhere near sufficient
npx lighthouse <url> --only-categories=accessibility
node <ui-intel>/uikit.mjs --contrast "#64748B" "#F1F5F9"
```
Automation can't judge whether alt text is *meaningful*, whether focus order makes *sense*, or whether the
error message *helps*. Tab through it yourself. The keyboard test costs 30 seconds and finds what axe can't.

## Report findings like this
`blocker` (locks someone out) · `major` (real difficulty) · `minor` (friction) — each with `path:line`, the
WCAG criterion, and the fix. Don't report a score; report what a person can't do.

---
*Priority 1 on the `ui-intel` ladder. Pairs with `fe-component-craft` (build it right the first time) and
`fe-design-review` (the full pass). See docs/ECOSYSTEM.md.*

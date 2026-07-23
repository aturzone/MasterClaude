---
name: fe-token-audit
description: >-
  Find and fix hardcoded design values that bypass the design system — raw hex/rgb/hsl colors, arbitrary
  Tailwind classes like `bg-[#1f2432]`, inline-style colors, and magic spacing/radius/shadow — and route
  each through a token. Triggers on "remove hardcoded colors", "use our design tokens", "enforce the design
  system", "why isn't dark mode working here", or a linter flagging arbitrary values. Complements
  `fe-design-system` (which defines the tokens); this enforces their use.
allowed-tools: Read, Grep, Glob, Write, Edit
---

# fe-token-audit — every visual value through a token, none hardcoded

A hardcoded color or spacing value is a design-system leak: it won't theme, won't switch to dark mode, and
drifts from the rest of the UI. This skill finds those leaks and routes each one back through a token — or,
when a token is genuinely missing, adds one named for its **role**. It enforces what `fe-design-system` defines.

## 1 · Find the token source *first* (never guess)
Read the project's canonical tokens before changing anything — the class/variable names come from here:
- **Tailwind v4** — `@theme` / `@theme extend` in a CSS file: `--color-primary: …` → utilities `text-primary` / `bg-primary`.
- **Tailwind v3** — `theme.extend` in `tailwind.config.{js,ts}`.
- **CSS variables** — `:root { --color-… }` (often with a light / dark block).
- **CSS-in-JS / token file** — a `theme` object (styled-components / emotion), vanilla-extract, or a Style-Dictionary / `tokens.json`.

If there's **no** token source at all, that's the real finding — hand off to `fe-design-system` to establish one before mass-replacing.

## 2 · Find the leaks
Hardcoded values hide in three places — arbitrary utility classes, inline styles, and raw CSS:
```bash
grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(' src --include='*.vue' --include='*.tsx' --include='*.css'
```
Sweep color first (it drifts the most), then the same way for magic **spacing / radius / shadow / z-index**.

## 3 · Classify each value (before any edit)
| It is… | Fix |
|---|---|
| an exact match for an existing token | replace with the token class / variable |
| a match for the framework's native palette (e.g. a stock Tailwind shade) | use the native class |
| a reusable role used **3+ times**, no token yet | **add a token, named by role** (`--color-text-muted`, *not* `--color-grey-88`), then replace all |
| a documented brand / third-party color | add to the linter's global allow-list — don't tokenize a brand |
| a genuine one-off (one campaign section) | keep it, with a one-line comment saying why |

## 4 · Fix, then verify
Apply by category, then re-grep — every raw value that remains must carry a written reason (allow-listed or
commented). Nothing hardcoded and silent.

## The naming rule that makes or breaks this
Name a token for the **role it plays**, never the value it holds. `--color-danger` survives a rebrand;
`--color-red-500` becomes a lie the first time the red changes. Same for the rest: `--space-gutter`, not
`--space-16`.

## Output
A fix plan: the classification table above filled in for this file, the concrete replacements, and any new
tokens to add (with role-names). Apply after the developer approves.

---
*Distilled from a production design-token methodology by **Atur Dana** and **Saeed Nezafat**, generalized beyond
Tailwind to any token system. Companions: `fe-design-system` (defines the tokens), `fe-design-review`, `fe-refactor`.*

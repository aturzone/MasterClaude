---
description: Run the SKULL design team on this project — brief, a real design system (concrete hex/style/fonts, contrast-verified), layout, build, and an accessibility-first review (triggers on "make it look professional", "it looks generic/AI-generated", "what colors should this use", redesign, "is this accessible")
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Task
---
As SKULL, run the design team on this project for: $ARGUMENTS

Follow the `wf-ui-uplift` skill. In short:
1. **Brief** — `ux-research`: who it's for, the job, the primary flow, the per-screen job. Ask if the repo can't answer it; never invent a persona.
2. **Detect the stack** (package.json / pubspec.yaml / *.xcodeproj / composer.json — **never assume**), then **generate + persist the system** with `ui-intel`:
   `node .claude/skills/frontend/ui-intel/uikit.mjs --design-system "<product> <industry>" --stack <detected> --persist --out . -p "<Name>"`
   → `.skull/design/MASTER.md`. If it already exists, **read and keep it** — pass `--force` only when asked.
3. **Layout → build → motion** — `fe-page-patterns`, `fe-component-craft`, `fe-motion` against those tokens (parallel via subagents only *after* the system is fixed).
4. **Review down the ladder** — `fe-design-review` + `fe-a11y` + `fe-perf`; band 1 (a11y) is a blocker however good it looks.
5. **Generate `skull.html`** via `skull-dashboard`, then report the verdict + the single highest-impact fix.

Safe by default: the `designer` agent is read-only toward your source — it writes only `.skull/design/` and
`skull.html`, and never overwrites an existing MASTER.md unasked. Contrast is verified with real WCAG maths
(`uikit.mjs --contrast`), not asserted.

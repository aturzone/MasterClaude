---
name: skull-dashboard
description: >-
  Generate skull.html — a self-contained, CLI-styled, professional, charted dashboard at the project root
  showing SKULL's team and its findings for THIS project (test results, coverage, audit/map
  findings), led by SKULL. Triggers on "make the dashboard", "skull.html", "show the project
  status", "generate the team report", or as the final step of wf-tester. A local artifact — never
  published to any website.
allowed-tools: Read, Grep, Glob, Bash, Write
---

# skull-dashboard — the project's status in one page

Render **`skull.html`** at the project root: a single self-contained HTML file (no external assets) that
shows, in a clean terminal/CLI aesthetic, the whole SKULL team's work on this project — who's
on the team, what each ran, and what they found — with real charts. It's for the developer to open
locally (or serve at `/mc` on their own app); it is **not** part of skull.shop.

## What it reads (whatever exists — all optional)
- `.skull/team.md` — the roster the leader assembled for this project (id · role · why).
- `.skull/qa/runs/<latest>/summary.json` + merged CTRF — the tester team's results (pass/fail/skip/refused, coverage, agent spend, evidence).
- `.skull/qa/findings/*.md` — tracked test findings (severity/area).
- `.sentinel/` — Sentinel's map + findings, if present.
- `.security/REPORT.md` + `.security/findings/*.md` — the Security Auditor's results, if present.

## What it renders
- **Header** — project name, "led by SKULL", generated timestamp, overall release verdict badge.
- **Team roster** — each active member with its role and one-line "why".
- **Charts** (inline SVG, theme-aware, following the `dataviz` guidance): test pass/fail donut, results-by-category bars, findings-by-severity, a coverage meter, a small trend line if prior runs exist.
- **Findings table** — severity · area · evidence (path:line / URL) · fix, most-severe first.
- CLI styling: monospace, a subtle scanline/prompt motif, dark + light aware. Everything inlined.

## How
Run the bundled generator (dependency-free Node):
```
node .claude/skills/testing/skull-dashboard/skull-dashboard.mjs            # reads ./.skull, ./.sentinel, ./.security → writes ./skull.html
node .claude/skills/testing/skull-dashboard/skull-dashboard.mjs --open     # also print the file:// path
```
It degrades gracefully: any missing source is just an omitted section; with nothing but `.skull/team.md`
it still renders the roster. After generating, tell the developer the path and, if they want it on
their running app, point them at the `/mc` snippet in this skill's README.

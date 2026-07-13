---
name: mc-dashboard
description: >-
  Generate mc.html — a self-contained, CLI-styled, professional, charted dashboard at the project root
  showing MASTER CLAUDE's team and its findings for THIS project (test results, coverage, audit/map
  findings), led by MASTER CLAUDE. Triggers on "make the dashboard", "mc.html", "show the project
  status", "generate the team report", or as the final step of wf-tester. A local artifact — never
  published to any website.
allowed-tools: Read, Grep, Glob, Bash, Write
---

# mc-dashboard — the project's status in one page

Render **`mc.html`** at the project root: a single self-contained HTML file (no external assets) that
shows, in a clean terminal/CLI aesthetic, the whole MASTER CLAUDE team's work on this project — who's
on the team, what each ran, and what they found — with real charts. It's for the developer to open
locally (or serve at `/mc` on their own app); it is **not** part of masterclaude.shop.

## What it reads (whatever exists — all optional)
- `.mc/team.md` — the roster the leader assembled for this project (id · role · why).
- `.mc/qa/runs/<latest>/summary.json` + merged CTRF — the tester team's results (pass/fail/skip/refused, coverage, agent spend, evidence).
- `.mc/qa/findings/*.md` — tracked test findings (severity/area).
- `.sentinel/` — Sentinel's map + findings, if present.
- `.security/REPORT.md` + `.security/findings/*.md` — the Security Auditor's results, if present.

## What it renders
- **Header** — project name, "led by MASTER CLAUDE", generated timestamp, overall release verdict badge.
- **Team roster** — each active member with its role and one-line "why".
- **Charts** (inline SVG, theme-aware, following the `dataviz` guidance): test pass/fail donut, results-by-category bars, findings-by-severity, a coverage meter, a small trend line if prior runs exist.
- **Findings table** — severity · area · evidence (path:line / URL) · fix, most-severe first.
- CLI styling: monospace, a subtle scanline/prompt motif, dark + light aware. Everything inlined.

## How
Run the bundled generator (dependency-free Node):
```
node .claude/skills/testing/mc-dashboard/mc-dashboard.mjs            # reads ./.mc, ./.sentinel, ./.security → writes ./mc.html
node .claude/skills/testing/mc-dashboard/mc-dashboard.mjs --open     # also print the file:// path
```
It degrades gracefully: any missing source is just an omitted section; with nothing but `.mc/team.md`
it still renders the roster. After generating, tell the developer the path and, if they want it on
their running app, point them at the `/mc` snippet in this skill's README.

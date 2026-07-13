---
description: Run the MASTER CLAUDE tester team on this project — user-end, black-box, code, and stress/load — and generate mc.html (triggers on "test everything", "QA this", "is it ready to ship", "the app has no tests", "load test")
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Task
---
As MASTER CLAUDE, run the tester team on this project for: $ARGUMENTS

Follow the `wf-tester` skill. In short:
1. **Map & scope** — what the project is, its surfaces, its risk; pick which passes apply.
2. **Set up** the per-project QA workspace on the bundled engine (`.claude/skills/testing/engine` — `pnpm install` once; `pnpm qa scaffold-service <name> --url <baseURL>`).
3. **Run the passes** (parallel via subagents when independent): `test-user-end`, `test-blackbox`, `test-code`, `test-stress`.
4. **Generate `mc.html`** via `mc-dashboard`, then report the release verdict + top fixes with evidence.

Safe by default: read-only toward the app's source, cost-capped agent lane, no `--dangerously`, no
unattended real-money actions. When something is sensitive or irreversible, ask first.

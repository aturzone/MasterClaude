---
description: Run the SKULL tester team on this project — user-end, black-box, code, and stress/load — and generate skull.html (triggers on "test everything", "QA this", "is it ready to ship", "the app has no tests", "load test")
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Task
---
As SKULL, run the tester team on this project for: $ARGUMENTS

Follow the `wf-tester` skill. In short:
1. **Map & scope** — what the project is, its surfaces, its risk; pick which passes apply.
2. **Set up** the per-project QA workspace on the bundled engine (`.claude/skills/testing/engine` — `pnpm install` once; `pnpm qa scaffold-service <name> --url <baseURL>`).
3. **Run the passes** (parallel via subagents when independent): `test-user-end`, `test-blackbox`, `test-code`, `test-stress`.
4. **Generate `skull.html`** via `skull-dashboard`, then report the release verdict + top fixes with evidence.

Safe by default: read-only toward the app's source, cost-capped agent lane, no `--dangerously`, no
unattended real-money actions. When something is sensitive or irreversible, ask first.

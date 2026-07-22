# SKULL for Cursor

Cursor reads `.cursor/rules/*.mdc` for always-on instructions and `.cursor/skills/` for `SKILL.md` skills
(Cursor **2.4+**). It also reads `AGENTS.md`, so the universal path works too — but this native setup is nicer.

## Install
From the SKULL repo root, into your project:

```bash
# 1) the leader rule (always applied)
mkdir -p <project>/.cursor/rules && cp adapters/cursor/skull.mdc <project>/.cursor/rules/

# 2) the skills
mkdir -p <project>/.cursor/skills && cp -r skills/* <project>/.cursor/skills/
```

Then, in Cursor: **"act as SKULL — set up my team for this project."**

## Notes
- Needs Cursor **2.4+** for `.cursor/skills/`. On older Cursor, use the universal `AGENTS.md` path
  (`adapters/universal/AGENTS.md` → `<project>/AGENTS.md`); the method ports, but skills won't be invocable.
- Cursor subagents (2.4+) can each load skills — SKULL's "delegate to a worker" steps map onto them.
- **Global install:** put the files in `~/.cursor/rules/` and `~/.cursor/skills/` to enable SKULL everywhere.

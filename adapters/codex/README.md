# SKULL for OpenAI Codex CLI

Codex is `AGENTS.md`-primary and reads `SKILL.md` skills from `.codex/skills/` (and the cross-tool
`.agents/skills/`). So SKULL's universal leader **is** the Codex leader — no separate rule file needed.

## Install
From the SKULL repo root, into your project:

```bash
# 1) the leader (Codex reads AGENTS.md at the repo root)
cp adapters/universal/AGENTS.md <project>/AGENTS.md

# 2) the skills (either location works; .agents/skills is the neutral cross-tool dir)
mkdir -p <project>/.codex/skills && cp -r skills/* <project>/.codex/skills/
```

Then run `codex` in the project and say **"act as SKULL — set up my team."**

## Optional config (`.codex/config.toml`, or `~/.codex/config.toml` for machine-wide)
```toml
# Also read a CLAUDE.md when a repo has one (handy for projects already set up for Claude Code)
project_doc_fallback_filenames = ["CLAUDE.md"]
```

## Notes
- Skills also resolve from `~/.agents/skills/` and `/etc/codex/skills/` — use those for a machine-wide install.
- Codex custom prompts live in `~/.codex/prompts/*.md` (invoked `/prompts:name`); skills are the newer,
  preferred path and cover what SKULL needs.
- Codex is a co-founder of the `AGENTS.md` standard, so the universal adapter is a first-class fit here.

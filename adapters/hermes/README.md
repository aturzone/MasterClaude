# SKULL for Hermes Agent (Nous Research)

Hermes is the closest agent to SKULL in spirit — a self-hosted **manager** with `SKILL.md` skills,
persistent memory, subagents (`delegate_task`), and natural-language **cron** jobs. It reads
`AGENTS.md`/`CLAUDE.md` for working context plus a curated `MEMORY.md`, and loads skills from `~/.hermes/skills/`.

## Install
```bash
# 1) working context + curated memory
cp adapters/universal/AGENTS.md <project>/AGENTS.md
cp adapters/hermes/MEMORY.md    <project>/MEMORY.md      # or merge into your existing MEMORY.md

# 2) the skills (Hermes' global skills dir)
mkdir -p ~/.hermes/skills && cp -r skills/* ~/.hermes/skills/
```

Then tell Hermes: **"act as SKULL — set up my team for this project."**

## Cron — SKULL's *operate* half, scheduled
Hermes' `cronjob` tool schedules work in natural language, can attach a skill, and delivers to any channel
(Telegram, Discord, …). Examples that fit the SKULL lifecycle:
- "Every night at 00:10, run the **guardian** skill over today's diff and DM me anything critical."
- "Every Monday 09:00, sweep the repo map for drift and post the new findings."
- "After each deploy tag, run the **ops-observe** checklist and summarize service health."

Keep the catastrophe rails: a cron job is still an **advisor** on production — it reports; it doesn't act on
a live system without a human.

## Notes
- `/learn` lets Hermes auto-author new skills — a natural way to grow your SKULL set; contribute the good
  ones back upstream.
- Hermes' skill frontmatter matches what SKULL already ships (`name` ≤ 64, `description` ≤ 1024), so the
  skills load as-is.

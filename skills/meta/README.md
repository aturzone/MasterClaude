# meta/ — MASTER CLAUDE working on MASTER CLAUDE

Skills here extend the project itself. If you find yourself explaining the same method twice, it belongs in a
skill — and this is where you learn how to write one that actually fires.

**Current members**
- `writing-skills` — author or sharpen a skill: the SKILL.md shape, trigger-only descriptions, matching the
  form of the guidance to the shape of the failure, and the stay-in-sync checklist.
- `statusline-designer` — design a custom Claude Code status line. Gated and opt-in: it never volunteers.

**The one rule worth repeating here:** a `description` is **triggers only, never a workflow summary**. A
description that summarizes the process becomes the shortcut the model takes *instead of* reading the body — and
then the skill is documentation nobody opens.

**Brainstorm — what else belongs here** (great first contributions)
- `skill-evals` — a scenario harness that proves a discipline skill changes behavior, with a no-guidance control.
- `claude-current` — a protocol for staying current with Claude Code instead of storing facts that rot.
- `description-audit` — sweep every description for workflow leakage and false claims.
- `plugin-packaging` — package the repo as a Claude Code plugin without losing the copy-the-md path.

**Add one:** create `skills/meta/<your-skill>/SKILL.md`. See [CONTRIBUTING](../../CONTRIBUTING.md).

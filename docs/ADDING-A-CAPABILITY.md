# Adding a capability — the stay-in-sync checklist

Every time we add or change a skill / agent / command, run this list so MASTER CLAUDE stays aware, the docs
and website stay accurate, and it actually ships. Nothing half-landed.

## 1. Build it (this skills repo)
- [ ] `skills/<category>/<id>/SKILL.md` (or `agents/<...>.md`) with valid frontmatter — `name`, a
      trigger-focused `description`, and `allowed-tools` / `tools`. New category? add `skills/<category>/README.md`.
- [ ] Promote it in the category README (from "brainstorm" to "current members").
- [ ] `node scripts/validate.mjs` is green.

## 2. Make the leader aware (`skills/master-claude/SKILL.md`)
- [ ] Discovery is automatic, but: add it to the leader's **category table** (for a new category) and add a
      **proactive-trigger row** if it should be offered on a signal.
- [ ] Add or adjust a command if it deserves one (`commands/...`).

## 3. Mirror to the website (private repo `master-claude`)
- [ ] `catalog/<id>/meta.json` (correct `category`, `title`, `description`, `preview`, `example`) +
      `catalog/<id>/content.md`.
- [ ] `node infra/seeds/build-catalog.mjs` → regenerates `frontend/public/catalog.json`.
- [ ] New category → add it to `build-catalog.mjs` rank **and** the Docs `GROUPS` (`frontend/src/pages/Docs.tsx`).
- [ ] Highlight in the Docs `ROSTER` / `IMPACT` if it's notable.
- [ ] `node scripts/sync-check.mjs` (from this repo) reports **in sync**.

## 4. Ship it
- [ ] Update the README team list on a new category. (Users get the change by re-copying
      `skills/ agents/ commands/` into `.claude/`.)
- [ ] Commit + **push** the skills repo (`aturzone/MasterClaude`).
- [ ] Build + **deploy** the website (`bash infra/deploy.sh`); **verify live** (home 200, catalog count, the
      new item present).
- [ ] Notable addition → a short **blog** post.

> Shortcut: inside the repos, run `/master-claude:checklist` — MASTER CLAUDE prints this and runs
> `validate.mjs` + `sync-check.mjs`, then tells you what's still pending.

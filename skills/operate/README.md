# operate/ — the production half: advisor, not actor

Skills here cover the other side of shipping: running software once it's live, and responding when it
breaks. They share one non-negotiable posture:

> On production, SKULL is an incident advisor with read access and a rollback plan — never an actor
> with write access. It helps the developer make the right decision; it does not make the change itself.

Every skill here keys off `.skull/env` (written by `ops-env-map`): on production it reads, advises, and hands
the developer the exact command — it never runs the destructive one itself.

**Current members**
- `ops-env-map` — know where you are before anything else; unprovable ⇒ production. Writes `.skull/env`.
- `ops-ship` — the pre-deploy gate: a brief with five required slots (verify · migration · rollback ·
  blast radius · flag/canary) and a tagged release.
- `ops-observe` — read the system's own story first: logs, metrics, health, recent deploys, error rates.
- `ops-incident` — incident commander: stabilize before you diagnose, keep a timeline, never edit prod live.
- `ops-rollback` — the revert by deploy shape, and the one-way door of schema migrations (expand/contract).
- `ops-postmortem` — blameless; action items become owned findings, and the guardrail that would have
  caught it gets built.

**The loop** — the skills are a cycle, not a menu:
`ops-ship` (gate the change) → `ops-observe` (watch it live) → `ops-incident` (when it breaks, stabilize)
→ `ops-rollback` (the usual lever) → `ops-postmortem` (learn) → **the lesson feeds back**: a new test, a
`Sentinel` invariant, or a `guardian` / `permissions.deny` guardrail so the same failure can't return
quietly. Every trip through the loop should leave the system harder to break the same way twice.

**Brainstorm — what else belongs here** (great first contributions)
- `ops-oncall-handoff` — a clean shift handoff: what's on fire, what's fragile, what changed.
- `ops-capacity` — headroom before a launch: will it hold at N× traffic, and where does it bend first.
- `ops-slo` — define the error budget, and let it decide when to ship features vs. pay down reliability.
- `ops-backup-verify` — prove the backup actually restores, before the day you need it.

**Add one:** create `skills/operate/<your-skill>/SKILL.md` — trigger-focused frontmatter, the advisor
posture, and a positive recipe. See [CONTRIBUTING](../../CONTRIBUTING.md).

# Security &amp; safety model

SKULL is designed to be **safe to add and safe to run**. Here is exactly how it behaves, so you — and
your Claude Code — can trust it. If a tool warned you that this repo looks risky, this document is the answer:
nothing here runs on its own, there are **no autonomous runners**, and every capability works under Claude
Code's normal permission prompts.

## It's inert markdown — installing it runs nothing
SKULL is plain `.md` files (skills, agents, commands) you copy into `.claude/`. **Copying them in
executes no code.** A skill is a *methodology* — text that shapes how Claude works *when you invoke it*. There
is **no install script, no postinstall, no background process, no daemon, no network call, no telemetry**. It's
all plain text you can read.

## No autonomous runners — everything runs interactively, with permissions on
SKULL ships **no** unattended runner scripts: there is no "always-on" build loop, no headless batch
runner — nothing that keeps working while you're away. Every capability
runs **interactively**, inside a normal Claude Code session, under the **normal permission prompts** — the same
approvals you'd get for any other work. Claude asks before it acts and you stay in control of every tool call.
Nothing in this repo skips those prompts, and no skill ever asks you to put a permission-skipping flag in a
hook or a script.

## Fan-out uses Claude Code's own safe primitives
The `fleet` skill (running the team across parallel sessions) is built **entirely on Claude Code's own
built-in fan-out** — background agents (`claude --bg`), agent teams, and git worktrees. Each of those runs
with the **same normal permissions** as any session. There is no bundled runner and nothing to opt out of.

## Catastrophe rails (always on)
No matter what any skill suggests, Claude will **never**: move or commit money, share secrets/credentials/2FA,
destroy real data outside the task, exfiltrate your code or data to an external endpoint, defeat a
security/identity check, or roam outside the project directory. Your own standing instructions and Claude's
safety judgement always outrank any SKULL skill.

## No data leaves your machine
SKULL makes **no network calls of its own** — no analytics, no phone-home, no license check. Everything
runs in **your** Claude with **your** model. The only outbound traffic is the optional `WebFetch`/`WebSearch` a
skill uses the same way you would in a normal session.

## Audit it in five minutes
- Read `skills/**/SKILL.md` — short, plain-text methodologies.
- Search the repo for any permission-skipping flag or unattended runner — there are **none**; every tool call
  goes through Claude Code's normal approval.
- There is no `package.json` `postinstall`, no hook that runs code on load, and no obfuscation.
- Every skill, agent, and command is plain Markdown you can read top to bottom.

## Reporting
Found a real issue? Open one at <https://github.com/aturzone/Skull/issues>. The user's standing
instructions and Claude's own safety judgement always outrank any SKULL skill — a skill changes *how*
Claude works, never *what is allowed*.

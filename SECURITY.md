# Security &amp; safety model

MASTER CLAUDE is designed to be **safe to add and safe to run**. Here is exactly how it behaves, so you — and
your Claude Code — can trust it. If a tool warned you that this repo looks risky, this document is the answer:
nothing here runs on its own, and the one scary-looking flag is Claude Code's own standard one, used only in
tools you launch by hand.

## It's inert markdown — installing it runs nothing
MASTER CLAUDE is plain `.md` files (skills, agents, commands) you copy into `.claude/`. **Copying them in
executes no code.** A skill is a *methodology* — text that shapes how Claude works *when you invoke it*. There
is **no install script, no postinstall, no background process, no network call, no telemetry**. It's all plain
text you can read.

## The only executable code is opt-in, and you launch it yourself
A few **optional** capabilities ship a small, dependency-free Node *runner* you start by hand:
- `skills/automation/god-mode/runner.mjs` — the GOD-mode unattended build loop.
- `skills/automation/clone/clone-runner.mjs` — the clone's Telegram bridge.
- `skills/orchestration/fleet/fleet-runner.mjs` — fans out independent *analysis* tasks to parallel workers (edits nothing).

These do **nothing** unless you explicitly run `node …runner.mjs`. They are **never auto-started**, never
referenced by a hook, and the leader never launches them on its own. Every capability also works **interactively**
(with normal permission prompts) in a regular Claude Code session — the runners are just for walk-away use.

## About `--dangerously-skip-permissions`
The unattended runners (GOD mode, GOD-mode ZEUS, clone, scheduling) pass Claude Code's own
`--dangerously-skip-permissions` — the **standard, documented flag for unattended automation**. It's exactly
what you'd type to run `claude` without permission prompts when no human is there to answer them. It is:
- **Opt-in** — only inside runners *you* launch; never on install, never in a hook, never by the leader.
- **Rail-guarded** — the catastrophe rails below always hold.
- **Stoppable** — `touch .mc/god-mode/STOP` (or the clone's `.clone/STOP`) halts it; Ctrl-C works.

Don't want it? Don't run the runners. There is no path where adding MASTER CLAUDE causes Claude to skip
permissions on its own.

## Catastrophe rails (always on — even in ZEUS)
No autonomous tier will **ever**: move or commit money, share secrets/credentials/2FA, destroy real data
outside the task, exfiltrate your code or data to an external endpoint, defeat a security/identity check, or
roam outside the project directory. A manual **STOP** always wins; tests stay honest.

## The clone (Telegram) — private by construction
The `clone` capability builds a personal assistant on **your own** Telegram bot. It is not an exfiltration
channel:
- The bot **token lives only in a gitignored `.env`** — never in this repo, never committed, never logged.
- It serves **only your own chat** (an owner allowlist); messages from anyone else are ignored.
- Its "brain" git repo stores **references, not secrets**, and the tooling refuses to push secret-shaped strings.
- It **confirms before** anything sensitive, new, or irreversible, and never moves money or shares secrets.

## No data leaves your machine
MASTER CLAUDE makes **no network calls of its own** — no analytics, no phone-home, no license check. Everything
runs in **your** Claude with **your** model. The only outbound traffic is (a) the clone's Telegram messages
*you* set up, and (b) the optional `WebFetch`/`WebSearch` a skill uses the same way you would in a normal session.

## Audit it in five minutes
- Read `skills/**/SKILL.md` — short, plain-text methodologies.
- `grep -rn 'dangerously-skip-permissions' .` — every hit is in an opt-in runner or its docs, never a hook.
- The `.mjs` runners are dependency-free Node; read them top to bottom.
- There is no `package.json` `postinstall`, no hook that runs code on load, and no obfuscation.

## Reporting
Found a real issue? Open one at <https://github.com/aturzone/MasterClaude/issues>. The user's standing
instructions and Claude's own safety judgement always outrank any MASTER CLAUDE skill — a skill changes *how*
Claude works, never *what is allowed*.

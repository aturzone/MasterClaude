---
name: writing-skills
description: >-
  Author a great SKULL skill (or sharpen one). Triggers on "write a skill", "add a skill", "create
  a skill", "make this a skill", "improve this skill's triggering", or when turning a repeatable methodology
  into a reusable `.md`. Covers the SKILL.md shape, the trigger-only description that actually fires, keeping
  it focused, crediting borrowed techniques, and the stay-in-sync checklist so the leader, docs and site all
  learn about it.
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Writing skills — make a methodology reusable

A skill is a focused `.md` that shapes *how* Claude does one job. Good skills are discovered at the right
moment and obeyed; bad ones are too vague to fire or too bloated to follow. Here's how to write the good kind.

## The shape
`skills/<category>/<name>/SKILL.md`, with frontmatter then the methodology as instructions to Claude:
```markdown
---
name: kebab-case-unique
description: >-
  One or two sentences on WHEN to reach for this — trigger phrases, symptoms, synonyms, error strings.
# optional: allowed-tools: Read, Grep, Bash, Edit, Write, Task
---
# Title
The methodology, written as instructions ("You are…", "When X, do Y"), with short scannable sections.
```

## The rules that matter
1. **One job, done well.** A skill the developer actually uses beats a big one they ignore. If it's doing
   three things, split it.
2. **The description says *when*, not *what*.** It's the trigger — pack it with the situations, symptoms,
   synonyms and error strings that should fire it. **Don't** summarize the whole workflow there: an agent
   that sees a summary acts on the *summary* instead of reading the full skill.
3. **Keep it tight.** Lead with the core principle; use short sections and tables; cut anything Claude
   already knows. Frequently-loaded skills especially: shorter is better.
4. **Instructions, not prose.** Write imperatives the model follows ("Explore first.", "Verify before
   claiming done."), not an essay about the topic.
5. **Credit borrowed ideas.** If a technique comes from another project, add a one-line credit footer and
   list it in `docs/ECOSYSTEM.md`. Re-implement the *idea*; don't copy their files.
6. **Make it honest.** A skill shapes *how* you work — it never overrides the user or safety.

## Match the form to the failure (the non-obvious part)
Pick the skill's *shape* from how an agent fails *without* it — the wrong shape backfires:
| Baseline failure | Right form | Wrong form |
|---|---|---|
| skips/violates a rule under pressure | a **prohibition** + a rationalization table + red-flags | soft "try to…" guidance |
| output is the wrong shape (bloated, buried verdict) | a **positive recipe/contract**: what the output IS, in order | prohibitions (here they trend *worse* than no guidance) |
| omits a required element | a **structural REQUIRED slot** in the template | prose reminders |
| behaviour should be conditional | a rule **keyed to an observable signal** | an unconditional rule + exemptions |

Two iron rules: **no nuance clauses** ("don't X unless…" reopens negotiation) and **exemptions don't scope**
("doesn't apply to code blocks" still suppresses code blocks — restructure instead).

## Baseline-first, and bulletproof the disciplines
The honest test of a discipline skill: run the scenario **without** it and record the *verbatim*
rationalizations — then write the minimal skill that answers **those**, and re-test until it holds (this
applies to *edits* too). If a no-guidance control doesn't even exhibit the failure, don't write the guidance.
To harden a rule-enforcing skill: close every loophole explicitly ("delete means delete"), add the meta-line
*violating the letter is violating the spirit*, build a **rationalization table** + a **red-flags** list from
the real excuses, and put the violation *symptoms* into the description so it fires.

## Pressure-test it
Before shipping, imagine the situations where it *should* fire and check the `description` would catch them;
imagine an agent under time pressure and check the skill's rules are unambiguous enough to hold. If you can,
run it on a real case and tighten the wording where it was ignored or misread.

## Don't forget the rest of the system (stay in sync)
A skill is more than its file — follow **`docs/ADDING-A-CAPABILITY.md`**: add it to the right category,
make the **leader** aware (category table + a proactive row if it should be offered on a signal), mirror it
to the website (`catalog/<id>/{meta.json,content.md}` + regenerate `catalog.json`), run `validate.mjs` +
`sync-check.mjs`, then push + deploy. The leader can run `/skull:checklist` to verify nothing's missed.

---
*Credits:* the "description says when not what" + focused-skill discipline is sharpened in **superpowers**
writing-skills (`obra/superpowers`, MIT) and **mattpocock/skills**. See `docs/ECOSYSTEM.md`.

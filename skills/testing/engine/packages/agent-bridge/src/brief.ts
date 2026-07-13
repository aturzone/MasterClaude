import fs from 'node:fs';
import path from 'node:path';
import type { RunPlan, Task } from '@mc-qa/core';

/**
 * Render the self-contained mission brief for an agent task. Composition order:
 * service agent-context.md → task charter → SAFETY RULES → selector memory slice
 * → aria snapshots → output contract. The brief is everything the agent gets.
 */
export function renderBrief(plan: RunPlan, task: Task, agentDir: string): string {
  const brief = task.automation.agentBrief;
  if (!brief) throw new Error(`task ${task.id} has no agentBrief`);

  const contextFile = path.join(plan.serviceDir, 'agent-context.md');
  const serviceContext = fs.existsSync(contextFile)
    ? fs.readFileSync(contextFile, 'utf8')
    : '_(no agent-context.md for this service yet)_';

  const selectorSlice: string[] = [];
  const selDir = path.join(plan.serviceDir, 'selector-memory');
  const wanted = new Set<string>();
  for (const k of task.procedure.selectorKeys ?? []) wanted.add(k.split('.')[0]);
  for (const s of task.procedure.steps) {
    if (s.locator) wanted.add(s.locator.split('.')[0]);
  }
  if (fs.existsSync(selDir)) {
    for (const f of fs.readdirSync(selDir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const pageName = f.replace(/\.json$/, '');
      if (wanted.size > 0 && !wanted.has(pageName)) continue;
      selectorSlice.push(`### selector-memory/${f}\n\`\`\`json\n${fs.readFileSync(path.join(selDir, f), 'utf8').trim()}\n\`\`\``);
    }
  }

  const ariaSlices: string[] = [];
  const ariaFile = task.oracle.baselines?.aria;
  if (ariaFile) {
    const p = path.join(plan.serviceDir, ariaFile);
    if (fs.existsSync(p)) {
      ariaSlices.push(`### ${ariaFile}\n\`\`\`yaml\n${fs.readFileSync(p, 'utf8').trim()}\n\`\`\``);
    }
  }

  const rubric = brief.successRubric
    .map((r) => `- [${r.verdict}] ${r.criterion}`)
    .join('\n');
  const forbidden = (task.risk.forbiddenActions ?? []).map((f) => `- ${f}`).join('\n') || '- (none beyond the global rules)';
  const resultFile = path.join(agentDir, 'result.ctrf.json').replaceAll('\\', '/');
  const learnedFile = path.join(agentDir, 'learned-selectors.json').replaceAll('\\', '/');
  const needsAuth = (task.procedure.preconditions ?? []).some(
    (p) => p.kind === 'account-state' && /logged.?in/i.test(p.value),
  );
  const sessionCheck = needsAuth
    ? `\n### FIRST — verify your session\nYou are given a logged-in session. Before anything else, load the base URL. If you land on \`/login\` or \`/starter\`, or you see the login form, the session is **NOT authenticated** — do NOT attempt to log in or request an OTP. Immediately write \`result.ctrf.json\` with every criterion **failed**, message \`"blocked: session not authenticated"\`, and stop.\n`
    : '';

  return `# MASTER CLAUDE QA Agent Brief — ${task.id}

You are a QA agent testing **${plan.serviceConfig.displayName}** from the end-user side,
via browser tools (Playwright MCP). Base URL: ${plan.baseURL}

## Service context

${serviceContext}

## Your mission

${brief.goal}

**Why this matters:** ${task.goal}
${sessionCheck}
### Constraints
${brief.constraints.map((c) => `- ${c}`).join('\n')}
- Maximum ${brief.maxSteps ?? 40} browser actions. If you cannot finish, report honestly what you covered.

### Success rubric (judge each explicitly)
Severity legend — each criterion is tagged with one level, and an UNMET criterion maps to a status:
- **must-pass** — a hard requirement; unmet ⇒ status \`failed\` (this fails the task).
- **should-pass** — expected but non-blocking; unmet ⇒ status \`other\` (a WARNING, NOT a task failure).
- **informational** — observation only; unmet ⇒ status \`other\` (never a task failure).
Do NOT up- or down-grade a criterion's own level; report honestly at the level it is tagged.

${rubric}

${brief.hints?.length ? `### Hints\n${brief.hints.map((h) => `- ${h}`).join('\n')}\n` : ''}

## SAFETY RULES (absolute — violating these is a failed run)

- Risk class of this task: **${task.risk.class}**. You may only read and navigate; never
  submit anything that moves money, changes security settings, or is irreversible.
${forbidden}

## Selector memory (known-good locators — use these before exploring)

${selectorSlice.join('\n\n') || '_(none for the pages of this task yet)_'}

${ariaSlices.length ? `## Page structure (aria snapshots)\n\n${ariaSlices.join('\n\n')}\n` : ''}

## Output contract (REQUIRED)

1. Write your verdicts to \`${resultFile}\` as CTRF JSON:
\`\`\`json
{
  "results": {
    "tool": { "name": "claude-agent" },
    "summary": { "tests": 1, "passed": 1, "failed": 0, "pending": 0, "skipped": 0, "other": 0, "start": 0, "stop": 0 },
    "tests": [
      {
        "name": "${task.id} — <rubric criterion>",
        "status": "passed | failed | other",
        "duration": 0,
        "message": "<what you observed, concretely>",
        "extra": { "taskId": "${task.id}", "lane": "agent", "verdictBy": "agent", "rubric": "must-pass | should-pass | informational" }
      }
    ]
  }
}
\`\`\`
One test entry per rubric criterion. Every entry MUST carry \`extra.rubric\` = that criterion's
level. Map status by level: criterion MET ⇒ \`passed\`; **must-pass** unmet ⇒ \`failed\`;
**should-pass** unmet ⇒ \`other\` (a warning, NOT a task failure); **informational** unmet ⇒ \`other\`.

**Write \`result.ctrf.json\` immediately after judging your FIRST criterion, then REWRITE it after EACH subsequent criterion — never leave it to the end.** If you run out of steps or time, the file must already contain every criterion you have judged so far, honestly marked (an unjudged criterion is \`other\` with "not reached", never \`passed\`). A hard timeout must never destroy your work.

2. If you discovered elements not in selector memory (or healed a broken one), write
\`${learnedFile}\`:
\`\`\`json
[
  { "page": "<page>", "key": "<page>.<kebab-name>", "proposedSelector": "<css>", "role": "<aria role>", "name": "<accessible name>", "description": "<what it is>", "reason": "new" }
]
\`\`\`
Use \`"reason": "heals:<page>.<name>"\` when replacing a broken entry. Proposals are reviewed by humans — you never edit the repo directly.

3. Save evidence screenshots into \`${agentDir.replaceAll('\\', '/')}\` as you go.
`;
}

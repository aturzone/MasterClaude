import fs from 'node:fs';
import path from 'node:path';
import { pickLang, type RunPlan } from '@mc-qa/core';
import { renderBrief, writeMcpConfig } from '@mc-qa/agent-bridge';
import { makeReport } from '@mc-qa/reporting';

/**
 * Agent lane. For each agent task: emit a self-contained brief.md + mcp.json under
 * agent/<taskId>/ and (in CI) a skipped/manual-pending CTRF fragment. The human then
 * drives a Claude session from the brief (Claude Code with --mcp-config, or
 * Claude-in-Chrome for on-site sessions) and `pnpm qa ingest --run <runId>` pulls
 * the results back in.
 */
export function dispatchAgentLane(plan: RunPlan, runDir: string): string[] {
  const briefed: string[] = [];
  for (const entry of plan.entries.filter((e) => e.lane === 'agent')) {
    const task = plan.tasks[entry.taskId];
    const agentDir = path.join(runDir, 'agent', task.id);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'brief.md'), renderBrief(plan, task, agentDir));
    writeMcpConfig(agentDir, { headless: false });

    if (plan.ci) {
      const report = makeReport('mc-qa-runner', [{
        name: `${task.id} — ${pickLang(task.title, 'en')}`,
        status: 'skipped',
        duration: 0,
        message: 'agent task skipped in CI (manual-pending) — run attended and ingest',
        extra: { taskId: task.id, lane: 'agent', reason: 'manual-pending' },
      }]);
      fs.writeFileSync(path.join(runDir, 'ctrf', `agent-${task.id}.json`), JSON.stringify(report, null, 2));
    }
    briefed.push(task.id);
  }
  return briefed;
}

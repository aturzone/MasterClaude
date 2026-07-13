import fs from 'node:fs';
import path from 'node:path';
import { pickLang, type RunPlan } from '@mc-qa/core';
import { makeReport } from '@mc-qa/reporting';
import { renderInterviewForm, renderInterviewMd, runInlineInterview } from './interview.ts';

export interface HumanLaneOptions {
  /** true = walk the interviews in the terminal now; false = emit artifacts + queue. */
  interactive: boolean;
}

/**
 * Human lane. Every human task gets interview.md + form.html under human/<taskId>/.
 * Interactive runs walk the interview inline; otherwise the task is queued
 * (skipped-needs-human) and results come back later via form.html + `qa ingest`,
 * or a dedicated `qa interview --run <runId>` session.
 */
export async function dispatchHumanLane(
  plan: RunPlan,
  runDir: string,
  opts: HumanLaneOptions,
): Promise<{ queued: string[]; interviewed: string[]; failures: number }> {
  const queued: string[] = [];
  const interviewed: string[] = [];
  let failures = 0;
  const ctrfDir = path.join(runDir, 'ctrf');
  const queue: string[] = [];

  for (const entry of plan.entries.filter((e) => e.lane === 'human')) {
    const task = plan.tasks[entry.taskId];
    const humanDir = path.join(runDir, 'human', task.id);
    fs.mkdirSync(humanDir, { recursive: true });
    if (task.humanInterview) {
      fs.writeFileSync(path.join(humanDir, 'interview.md'), renderInterviewMd(task));
      fs.writeFileSync(path.join(humanDir, 'form.html'), renderInterviewForm(task));
    }

    if (opts.interactive && task.humanInterview && !plan.ci) {
      const verdict = await runInlineInterview(task, humanDir, ctrfDir);
      if (verdict === 'failed') failures++;
      interviewed.push(task.id);
    } else {
      const report = makeReport('mc-qa-runner', [{
        name: `${task.id} — ${pickLang(task.title, 'en')}`,
        status: 'skipped',
        duration: 0,
        message: 'human task queued — open human/<taskId>/form.html, save result.json there, then `pnpm qa ingest`',
        extra: { taskId: task.id, lane: 'human', reason: 'manual-pending' },
      }]);
      fs.writeFileSync(path.join(ctrfDir, `human-${task.id}.json`), JSON.stringify(report, null, 2));
      queued.push(task.id);
      queue.push(task.id);
    }
  }

  if (queue.length > 0) {
    fs.writeFileSync(path.join(runDir, 'human-queue.json'), JSON.stringify({ tasks: queue }, null, 2));
  }
  return { queued, interviewed, failures };
}

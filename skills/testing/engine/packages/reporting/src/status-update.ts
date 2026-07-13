import fs from 'node:fs';
import path from 'node:path';
import type { CtrfReport, RunPlan, RunTaskStatus, StatusFile } from '@mc-qa/core';

function taskIdOf(testName: string): string | null {
  const m = /^([a-z0-9.-]+\.\d{3})(?:\s|$)/.exec(testName);
  return m ? m[1] : null;
}

/**
 * Fold a run's merged CTRF back into the committed per-profile status file and
 * append one summary line to runs.ndjson. Git is the TCMS: latest verdicts live in history.
 */
export function updateStatus(plan: RunPlan, merged: CtrfReport): StatusFile {
  const statusDir = path.join(plan.serviceDir, 'status');
  fs.mkdirSync(statusDir, { recursive: true });
  const file = path.join(statusDir, `${plan.envProfile}.json`);
  const status: StatusFile = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as StatusFile)
    : { envProfile: plan.envProfile, updatedAt: '', tasks: {} };

  const now = new Date().toISOString();
  const byTask = new Map<string, { statuses: Set<string>; duration: number; verdictBy?: string; flaky: boolean; softFails: number; agentOutcome?: string }>();
  for (const t of merged.results.tests) {
    const id = (t.extra?.taskId as string | undefined) ?? taskIdOf(t.name);
    if (!id) continue;
    const rec = byTask.get(id) ?? { statuses: new Set<string>(), duration: 0, flaky: false, softFails: 0 };
    rec.statuses.add(t.status);
    rec.duration += t.duration ?? 0;
    if (t.flaky || (typeof t.retries === 'number' && t.retries > 0)) rec.flaky = true;
    // Soft fails (should-pass/informational downgraded to 'other' at ingest) are a warning, not a
    // failure — counted and surfaced, but they never change the all-or-nothing failure rule below.
    if (t.extra?.softFail === true) rec.softFails += 1;
    // An agent task that produced no verdict (synthetic fragment from ingest) — carry the outcome so
    // resolve() maps it to `blocked` (agent-retry), never skipped-needs-human.
    if (t.extra?.agentOutcome) rec.agentOutcome = String(t.extra.agentOutcome);
    if (t.extra?.verdictBy) rec.verdictBy = String(t.extra.verdictBy);
    byTask.set(id, rec);
  }

  type Verdict = StatusFile['tasks'][string]['verdictBy'];
  const laneOfTask = (taskId: string) => plan.entries.find((e) => e.taskId === taskId)?.lane;
  const resolve = (taskId: string): { status: RunTaskStatus; verdictBy?: Verdict; durationMs?: number; flaky?: boolean; softFails?: number; agentOutcome?: string } | null => {
    const rec = byTask.get(taskId);
    const task = plan.tasks[taskId];
    if (rec) {
      // An agent task that produced no verdict (driver-error / timeout / session-blocked) is
      // `blocked` and needs a re-run — NOT a human interview, NOT a product failure.
      if (rec.agentOutcome) {
        return { status: 'blocked', verdictBy: 'agent', durationMs: rec.duration, agentOutcome: rec.agentOutcome };
      }
      let st: RunTaskStatus;
      if (rec.statuses.has('failed')) st = 'failed';
      else if (rec.statuses.has('passed')) st = task && task.automation.humanInvolvement === 2 ? 'pending-review' : 'passed';
      else if (rec.statuses.has('skipped')) st = task && task.automation.humanInvolvement >= 3 ? 'skipped-needs-human' : 'blocked';
      // only 'other' (inconclusive, e.g. an LHCI budget that could not be computed) → needs a look
      else st = 'pending-review';
      return {
        status: st,
        verdictBy: (rec.verdictBy ?? (laneOfTask(taskId) === 'cli' ? 'cli' : 'script')) as Verdict,
        durationMs: rec.duration,
        // A retried pass stays honest: the pass is real, the flake is recorded.
        ...(rec.flaky ? { flaky: true } : {}),
        // Additive: a passed/failed task may still carry N soft-fail warnings.
        ...(rec.softFails > 0 ? { softFails: rec.softFails } : {}),
      };
    }
    if (!task) return null;
    if (task.lifecycle.status === 'quarantined') return { status: 'quarantined' };
    // Agent tasks emit a brief and await an attended Claude session (no CTRF yet in a local run).
    if (laneOfTask(taskId) === 'agent' || task.automation.humanInvolvement >= 3) return { status: 'skipped-needs-human' };
    return { status: 'blocked' };
  };

  for (const entry of plan.entries) {
    const r = resolve(entry.taskId);
    if (r) status.tasks[entry.taskId] = { ...r, runId: plan.runId, at: now };
  }
  for (const refusal of plan.refused) {
    const t = plan.tasks[refusal.taskId];
    const st: RunTaskStatus = t?.lifecycle.status === 'quarantined' ? 'quarantined' : 'skipped-risk-gate';
    status.tasks[refusal.taskId] = { status: st, runId: plan.runId, at: now };
  }
  status.updatedAt = now;
  fs.writeFileSync(file, JSON.stringify(status, null, 2) + '\n');

  const s = merged.results.summary;
  const line = {
    runId: plan.runId,
    env: plan.envProfile,
    at: now,
    tests: s.tests,
    passed: s.passed,
    failed: s.failed,
    skipped: s.skipped,
    pending: s.pending,
    refused: plan.refused.length,
  };
  fs.appendFileSync(path.join(statusDir, 'runs.ndjson'), JSON.stringify(line) + '\n');
  return status;
}

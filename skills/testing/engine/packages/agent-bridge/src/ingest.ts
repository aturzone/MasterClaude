import fs from 'node:fs';
import path from 'node:path';
import type { AgentRubricItem, CtrfReport, RunPlan, SelectorProposal } from '@mc-qa/core';
import { mergeProposals, type MergeResult } from '@mc-qa/selector-memory';
import { criterionText, resolveRubricLevel } from './severity.ts';

export interface IngestResult {
  tasksIngested: string[];
  selectorMerge: MergeResult | null;
  problems: string[];
}

/** Recompute a CTRF fragment's summary counts from its tests[] (after status downgrades). */
function recomputeSummary(report: CtrfReport): void {
  const tests = report.results.tests;
  const s = report.results.summary;
  s.tests = tests.length;
  s.passed = tests.filter((t) => t.status === 'passed').length;
  s.failed = tests.filter((t) => t.status === 'failed').length;
  s.pending = tests.filter((t) => t.status === 'pending').length;
  s.skipped = tests.filter((t) => t.status === 'skipped').length;
  s.other = tests.filter((t) => t.status === 'other').length;
}

/**
 * Pull agent/human artifacts dropped into a run folder back into the pipeline:
 * - agent/<taskId>/result.ctrf.json  → validated, copied to ctrf/agent-<taskId>.json
 * - agent/<taskId>/learned-selectors.json → merged as candidates (PR-reviewed)
 * - human/<taskId>/result.json       → converted by the interview adapter upstream
 */
/** Agent-lane outcomes that produced NO verdict — the task needs a re-run, not a human interview.
 * A synthetic CTRF fragment below carries these to a `blocked` status via status-update. */
const NO_VERDICT_OUTCOMES = new Set([
  'driver-error',
  'timeout',
  'no-result',
  'blocked-no-session',
  'blocked-keeper-down',
  'skipped-budget',
]);

/** Read agent/summary.json into a taskId→outcome map (empty if absent). */
function readAgentOutcomes(runDir: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const summary = JSON.parse(fs.readFileSync(path.join(runDir, 'agent', 'summary.json'), 'utf8')) as {
      results?: Array<{ taskId: string; outcome: string }>;
    };
    for (const r of summary.results ?? []) map.set(r.taskId, r.outcome);
  } catch {
    /* no summary yet */
  }
  return map;
}

/** A minimal CTRF fragment marking an agent task that produced no verdict. Status `skipped` (an
 * existing CTRF status, so merge math is untouched) + extra.agentOutcome, which status-update maps to
 * `blocked` — NOT skipped-needs-human. Overwritten by the real result on a later successful re-run. */
function writeNoVerdictFragment(ctrfDir: string, taskId: string, outcome: string): void {
  const report: CtrfReport = {
    results: {
      tool: { name: 'mc-qa-agent-driver' },
      summary: { tests: 1, passed: 0, failed: 0, pending: 0, skipped: 1, other: 0, start: 0, stop: 0 },
      tests: [
        {
          name: `${taskId} — agent lane produced no verdict (${outcome})`,
          status: 'skipped',
          duration: 0,
          message: `agent ${outcome} after retry — needs re-run, NOT a human interview`,
          extra: { taskId, lane: 'agent', verdictBy: 'agent', agentOutcome: outcome },
        },
      ],
    },
  };
  fs.writeFileSync(path.join(ctrfDir, `agent-${taskId}.json`), JSON.stringify(report, null, 2));
}

/** A guard-violation with no result is a real FAILURE (the agent repeatedly hit forbidden money/
 * security/PII controls), not an infra retry — write a `failed` fragment (no agentOutcome) so it
 * surfaces in the report's needs-fixing bucket, never as a silent human interview. */
function writeGuardViolationFragment(ctrfDir: string, taskId: string): void {
  const report: CtrfReport = {
    results: {
      tool: { name: 'mc-qa-agent-driver' },
      summary: { tests: 1, passed: 0, failed: 1, pending: 0, skipped: 0, other: 0, start: 0, stop: 0 },
      tests: [
        {
          name: `${taskId} — agent blocked by the action-guard (repeated forbidden actions)`,
          status: 'failed',
          duration: 0,
          message: 'the action-guard denied 4+ forbidden actions (money/security/OTP/PII) — the task could not complete without a forbidden step; investigate.',
          extra: { taskId, lane: 'agent', verdictBy: 'agent' },
        },
      ],
    },
  };
  fs.writeFileSync(path.join(ctrfDir, `agent-${taskId}.json`), JSON.stringify(report, null, 2));
}

export function ingestAgentResults(plan: RunPlan, runDir: string): IngestResult {
  const result: IngestResult = { tasksIngested: [], selectorMerge: null, problems: [] };
  const agentRoot = path.join(runDir, 'agent');
  if (!fs.existsSync(agentRoot)) return result;
  const ctrfDir = path.join(runDir, 'ctrf');
  fs.mkdirSync(ctrfDir, { recursive: true });
  const allProposals: SelectorProposal[] = [];
  const outcomeByTask = readAgentOutcomes(runDir);

  for (const taskId of fs.readdirSync(agentRoot)) {
    const dir = path.join(agentRoot, taskId);
    if (!fs.statSync(dir).isDirectory()) continue;
    const resultFile = path.join(dir, 'result.ctrf.json');
    // Turn a driven-but-no-verdict task into an honest synthetic fragment (guard-violation → failed;
    // driver-error/timeout/session-blocked → blocked) instead of letting it fall through to
    // skipped-needs-human. Used for BOTH "no file" and "file with empty tests[]".
    const synthesizeNoVerdict = (why: string): boolean => {
      const outcome = outcomeByTask.get(taskId);
      if (outcome === 'guard-violation') {
        writeGuardViolationFragment(ctrfDir, taskId);
        result.tasksIngested.push(taskId);
        result.problems.push(`${taskId}: guard-violation (${why}) → failed (agent hit forbidden controls)`);
        return true;
      }
      if (outcome && NO_VERDICT_OUTCOMES.has(outcome)) {
        writeNoVerdictFragment(ctrfDir, taskId, outcome);
        result.tasksIngested.push(taskId);
        result.problems.push(`${taskId}: agent ${outcome} (${why}) → blocked/agent-retry (not a human interview)`);
        return true;
      }
      return false;
    };
    if (fs.existsSync(resultFile)) {
      try {
        const report = JSON.parse(fs.readFileSync(resultFile, 'utf8')) as CtrfReport;
        if (!Array.isArray(report.results?.tests) || report.results.tests.length === 0) {
          if (!synthesizeNoVerdict('empty result.ctrf.json')) result.problems.push(`${taskId}: result.ctrf.json has no tests[]`);
        } else {
          for (const t of report.results.tests) {
            t.extra = { taskId, lane: 'agent', verdictBy: 'agent', ...t.extra };
          }
          // Severity normalization (agents are unreliable narrators): a `failed` test whose
          // authored rubric level is should-pass/informational is only a WARNING — downgrade it
          // to `other` + extra.softFail so it no longer sinks an otherwise-healthy task.
          const rubric: AgentRubricItem[] = plan.tasks[taskId]?.automation.agentBrief?.successRubric ?? [];
          for (const t of report.results.tests) {
            if (t.status !== 'failed') continue;
            const level = resolveRubricLevel(t, rubric);
            if (level === 'should-pass' || level === 'informational') {
              t.status = 'other';
              t.extra = { ...t.extra, rubric: t.extra?.rubric ?? level, softFail: true };
              result.problems.push(
                `${taskId}: softFail — '${criterionText(t)}' is ${level}; failed→other (warning, not a task failure)`,
              );
            }
          }
          recomputeSummary(report);
          fs.writeFileSync(path.join(ctrfDir, `agent-${taskId}.json`), JSON.stringify(report, null, 2));
          result.tasksIngested.push(taskId);
        }
      } catch (e) {
        result.problems.push(`${taskId}: unreadable result.ctrf.json — ${(e as Error).message}`);
      }
    } else {
      // No verdict file — synthesize from the driver's recorded outcome (see synthesizeNoVerdict).
      // Tasks with no recorded outcome (never driven) stay as-is.
      if (!synthesizeNoVerdict('no result.ctrf.json')) {
        result.problems.push(`${taskId}: no result.ctrf.json yet (agent run incomplete?)`);
      }
    }

    const learnedFile = path.join(dir, 'learned-selectors.json');
    if (fs.existsSync(learnedFile)) {
      try {
        const proposals = JSON.parse(fs.readFileSync(learnedFile, 'utf8')) as SelectorProposal[];
        if (Array.isArray(proposals)) allProposals.push(...proposals);
      } catch (e) {
        result.problems.push(`${taskId}: unreadable learned-selectors.json — ${(e as Error).message}`);
      }
    }
  }

  if (allProposals.length > 0) {
    result.selectorMerge = mergeProposals(plan.serviceDir, plan.service, allProposals, plan.runId);
  }
  return result;
}

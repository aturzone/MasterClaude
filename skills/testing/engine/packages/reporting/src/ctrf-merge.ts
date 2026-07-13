import fs from 'node:fs';
import path from 'node:path';
import type { CtrfReport, CtrfTest } from '@mc-qa/core';

export function emptyReport(tool = 'mc-qa'): CtrfReport {
  const now = Date.now();
  return {
    results: {
      tool: { name: tool },
      summary: { tests: 0, passed: 0, failed: 0, pending: 0, skipped: 0, other: 0, start: now, stop: now },
      tests: [],
    },
  };
}

export function makeReport(tool: string, tests: CtrfTest[]): CtrfReport {
  const report = emptyReport(tool);
  report.results.tests = tests;
  recompute(report);
  return report;
}

function recompute(report: CtrfReport): void {
  const s = report.results.summary;
  s.tests = report.results.tests.length;
  s.passed = report.results.tests.filter((t) => t.status === 'passed').length;
  s.failed = report.results.tests.filter((t) => t.status === 'failed').length;
  s.pending = report.results.tests.filter((t) => t.status === 'pending').length;
  s.skipped = report.results.tests.filter((t) => t.status === 'skipped').length;
  s.other = report.results.tests.filter((t) => t.status === 'other').length;
  s.stop = Date.now();
}

/**
 * Merge every CTRF fragment in <runDir>/ctrf into one merged.ctrf.json.
 * Script, agent, human and sidecar lanes all funnel through here — one report per run.
 */
export function mergeRun(runDir: string): CtrfReport {
  const ctrfDir = path.join(runDir, 'ctrf');
  const merged = emptyReport();
  merged.results.summary.start = Date.now();
  if (fs.existsSync(ctrfDir)) {
    for (const f of fs.readdirSync(ctrfDir).sort()) {
      if (!f.endsWith('.json')) continue;
      try {
        const frag = JSON.parse(fs.readFileSync(path.join(ctrfDir, f), 'utf8')) as CtrfReport;
        const tests = frag.results?.tests ?? [];
        const source = f.replace(/\.json$/, '');
        for (const t of tests) merged.results.tests.push({ ...t, extra: { source, ...t.extra } });
        if (frag.results?.summary?.start && frag.results.summary.start < merged.results.summary.start) {
          merged.results.summary.start = frag.results.summary.start;
        }
      } catch (e) {
        merged.results.tests.push({
          name: `ctrf-fragment ${f} unreadable`,
          status: 'other',
          duration: 0,
          message: String((e as Error).message),
        });
      }
    }
  }
  recompute(merged);
  fs.writeFileSync(path.join(runDir, 'merged.ctrf.json'), JSON.stringify(merged, null, 2));
  return merged;
}

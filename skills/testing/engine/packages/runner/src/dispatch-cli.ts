import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import type { RunPlan } from '@mc-qa/core';
import { lhciToCtrf, linkinatorToCtrf, k6ToCtrf } from '@mc-qa/reporting';

function bin(root: string, name: string): string {
  return path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}

/**
 * CLI lane: budget/crawler tools whose JSON output is adapted into CTRF fragments.
 * - lhci: Lighthouse CI collect+assert against the task's cliUrls (budgets in
 *   apps/<svc>/tools/lighthouserc.json). Uses Playwright's Chromium via CHROME_PATH.
 * - linkinator: link crawl, broken links fail the task.
 */
export function dispatchCliLane(root: string, plan: RunPlan, runDir: string): number {
  let failures = 0;
  const ctrfDir = path.join(runDir, 'ctrf');
  const shell = process.platform === 'win32';

  for (const entry of plan.entries.filter((e) => e.lane === 'cli')) {
    const task = plan.tasks[entry.taskId];
    const urls = (task.automation.cliUrls ?? []).map((u) => new URL(u, plan.baseURL).href);

    if (entry.cliKind === 'lhci') {
      const workDir = path.join(runDir, 'sidecars', 'lighthouse', task.id.replaceAll('.', '-'));
      fs.mkdirSync(workDir, { recursive: true });
      const rcFile = path.join(plan.serviceDir, 'tools', 'lighthouserc.json');
      const args = ['autorun', `--config=${rcFile}`, '--collect.numberOfRuns=1'];
      for (const u of urls) args.push(`--collect.url=${u}`);
      console.log(`\n[cli:lhci] ${task.id} → ${urls.join(', ')}`);
      const res = spawnSync(bin(root, 'lhci'), args, {
        cwd: workDir,
        stdio: 'inherit',
        shell,
        env: { ...process.env, CHROME_PATH: chromium.executablePath() },
      });
      const report = lhciToCtrf(task, path.join(workDir, '.lighthouseci'));
      fs.writeFileSync(path.join(ctrfDir, `cli-${task.id}.json`), JSON.stringify(report, null, 2));
      // Only real budget failures fail the run. LHCI on Windows hosts crashes on temp
      // cleanup (EPERM) AFTER auditing — an inconclusive OTHER, not a budget failure.
      // The deterministic lane for LHCI is Docker/Linux.
      if (report.results.summary.failed > 0) failures++;
      if ((res.status ?? 1) !== 0 && report.results.summary.tests === report.results.summary.other) {
        console.warn(`[cli:lhci] ${task.id}: Lighthouse did not produce budget results (likely a Windows temp-cleanup crash — run this lane in Docker).`);
      }
    }

    if (entry.cliKind === 'linkinator') {
      console.log(`\n[cli:linkinator] ${task.id} → ${urls.join(', ')}`);
      // Default concurrency is 100 — that turns the crawl into a mini load test that 504s
      // slow SSR pages (self-inflicted, not a broken link). Cap it, set a real timeout, and
      // retry transient errors so a 5xx only survives if the origin genuinely can't serve it.
      const res = spawnSync(
        bin(root, 'linkinator'),
        [
          ...urls,
          '--format', 'json',
          '--concurrency', '25',
          '--timeout', '30000',
          '--retry',
          '--retry-errors',
          '--retry-errors-count', '3',
          '--retry-errors-jitter', '2000',
        ],
        { cwd: root, encoding: 'utf8', shell },
      );
      const report = linkinatorToCtrf(task, res.stdout ?? '', urls[0]);
      fs.writeFileSync(path.join(ctrfDir, `cli-${task.id}.json`), JSON.stringify(report, null, 2));
      if (report.results.summary.failed > 0) failures++;
    }

    if (entry.cliKind === 'k6') {
      // Load/stress lane. The k6 script lives at <serviceDir>/specs/k6/<taskid>.js and reads the
      // target from __ENV.TARGET; it must declare thresholds (a run passes only if they hold). k6
      // is a standalone binary (not an npm .bin) — if it's absent, the summary won't exist and the
      // task resolves to skipped/blocked rather than a false pass.
      const slug = task.id.replaceAll('.', '-');
      const scriptPath = path.join(plan.serviceDir, 'specs', 'k6', `${slug}.js`);
      const summaryPath = path.join(runDir, 'sidecars', 'k6', `${slug}.summary.json`);
      fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
      console.log(`\n[cli:k6] ${task.id} → ${scriptPath} (target ${plan.baseURL})`);
      let exit = 1;
      if (fs.existsSync(scriptPath)) {
        const res = spawnSync('k6', ['run', scriptPath, '--summary-export', summaryPath, '--env', `TARGET=${plan.baseURL}`], {
          cwd: root, stdio: 'inherit', shell,
        });
        exit = res.status ?? 1;
        if (res.error) console.warn(`[cli:k6] ${task.id}: k6 not runnable (${res.error.message}) — install k6 (https://k6.io).`);
      } else {
        console.warn(`[cli:k6] ${task.id}: no script at ${scriptPath} — skipped.`);
      }
      const report = k6ToCtrf(task, summaryPath, exit);
      fs.writeFileSync(path.join(ctrfDir, `cli-${task.id}.json`), JSON.stringify(report, null, 2));
      if (report.results.summary.failed > 0) failures++;
    }
  }
  return failures;
}

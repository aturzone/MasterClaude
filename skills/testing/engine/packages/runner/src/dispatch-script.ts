import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadEnvProfile, resolveRedactions, type RunPlan } from '@mc-qa/core';

/** Resolve @playwright/test's own cli.js from the service's dependencies (not the root .bin). */
function playwrightCli(serviceDir: string): string {
  const require = createRequire(path.join(serviceDir, 'package.json'));
  const pkgJson = require.resolve('@playwright/test/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { bin?: string | Record<string, string> };
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.playwright;
  if (!binRel) throw new Error('cannot locate the @playwright/test CLI');
  return path.join(path.dirname(pkgJson), binRel);
}

export interface ScriptLaneOptions {
  headed: boolean;
  allowHostVisual: boolean;
  updateBaselines: boolean;
  workers?: number;
  /** Reuse the stored authenticated session (from `qa login`) for this run. */
  authenticated?: boolean;
}

/**
 * Run the script lane: spawn `playwright test` against the service config with the
 * frozen plan as contract. The CTRF reporter drops ctrf/script.json into the run dir.
 */
export function dispatchScriptLane(
  root: string,
  plan: RunPlan,
  runDir: string,
  opts: ScriptLaneOptions,
): number {
  const scriptEntries = plan.entries.filter((e) => e.lane === 'script');
  if (scriptEntries.length === 0) return 0;

  const args = [playwrightCli(plan.serviceDir), 'test', '--config', path.join(plan.serviceDir, 'playwright.config.ts')];
  if (opts.headed) args.push('--headed');
  if (opts.updateBaselines) args.push('--update-snapshots');
  if (opts.workers) args.push('--workers', String(opts.workers));

  // Secret values (phone/OTP) set for this profile → scrubbed from any attached log.
  let redactions: string[] = [];
  try {
    redactions = resolveRedactions(loadEnvProfile(plan.serviceDir, plan.envProfile));
  } catch {
    /* profile already validated in buildPlan */
  }

  // Authenticated runs reuse the session saved by `qa login` (no password/OTP per run).
  let storageState = '';
  if (opts.authenticated) {
    storageState = path.join(plan.serviceDir, '.session', `${plan.envProfile}.json`);
    if (!fs.existsSync(storageState)) {
      throw new Error(
        `--authenticated needs a saved session, but ${storageState} is missing.\n` +
          `Run:  pnpm qa login --service ${plan.service} --env ${plan.envProfile}`,
      );
    }
  }

  const res = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      QA_PLAN: path.join(runDir, 'plan.json'),
      QA_RUN_DIR: runDir,
      QA_BASE_URL: plan.baseURL,
      QA_ALLOWED_RISK: plan.allowedRiskClasses.join(','),
      QA_HEADED: opts.headed ? '1' : '0',
      QA_ALLOW_HOST_VISUAL: opts.allowHostVisual ? '1' : '0',
      // Orchestrated runs retry once to absorb transient cold-load flakiness (kept
      // auditable via the CTRF reporter's flaky flag). Overridable per-invocation.
      QA_RETRIES: process.env.QA_RETRIES ?? '1',
      QA_REDACT: JSON.stringify(redactions),
      QA_STORAGE_STATE: storageState,
    },
  });
  return res.status ?? 1;
}

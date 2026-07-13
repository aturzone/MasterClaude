import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import type { EnvProfile, ServiceConfig } from '@mc-qa/core';

interface QaOptions {
  qaService: ServiceConfig | undefined;
  qaServiceDir: string;
}

function defaultBaseURL(serviceDir: string, cfg: ServiceConfig): string | undefined {
  try {
    const file = path.join(serviceDir, 'envs', `${cfg.defaultEnv}.json`);
    const profile = JSON.parse(fs.readFileSync(file, 'utf8')) as EnvProfile;
    return profile.baseURL.startsWith('${') ? undefined : profile.baseURL;
  } catch {
    return undefined;
  }
}

/**
 * The 5-line playwright.config.ts of every service calls this factory.
 * All QA_* env vars are set by the runner CLI; direct `playwright test` runs get
 * safe defaults (results/dev, default env profile's baseURL, risk gate at "a").
 */
export function defineServiceConfig(serviceDir: string, cfg: ServiceConfig) {
  const root = path.resolve(serviceDir, '..', '..');
  const runDir = process.env.QA_RUN_DIR ?? path.join(root, 'results', 'dev');
  const baseURL = process.env.QA_BASE_URL ?? defaultBaseURL(serviceDir, cfg);
  // Authenticated runs reuse the session saved by `qa login` (set via QA_STORAGE_STATE).
  const storageState =
    process.env.QA_STORAGE_STATE && fs.existsSync(process.env.QA_STORAGE_STATE)
      ? process.env.QA_STORAGE_STATE
      : undefined;

  return defineConfig<QaOptions>({
    testDir: path.join(serviceDir, 'specs'),
    outputDir: path.join(runDir, 'script', 'test-results'),
    fullyParallel: true,
    // Cap parallelism: 6+ concurrent Flutter/CanvasKit cold boots saturate CPU and the
    // origin, timing out appShellRendered under load. 4 keeps the lane fast without the
    // pileup. The CLI --workers flag (QA_WORKERS) still overrides.
    workers: process.env.QA_WORKERS ? Number(process.env.QA_WORKERS) : 4,
    timeout: 90_000,
    expect: {
      timeout: 15_000,
      toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
    },
    // Orchestrated runs (via the CLI) set QA_RETRIES=1 to absorb transient cold-load
    // flakiness; a genuinely broken deploy still fails both attempts. Bare `playwright
    // test` dev loops keep 0 so devs see raw flakiness. Retries stay auditable (the CTRF
    // reporter records flaky:true + the failed attempt).
    retries: Number(process.env.QA_RETRIES ?? 0),
    // Visual baselines are OS-dependent (font rasterization) — platform is part of the name,
    // and the Linux/Docker renders are the only committed ones (see risk-and-safety.md).
    snapshotPathTemplate: path.join(serviceDir, 'baselines', '{arg}-{projectName}-{platform}{ext}'),
    reporter: [
      ['list'],
      ['html', { outputFolder: path.join(runDir, 'script', 'playwright-report'), open: 'never' }],
      ['playwright-ctrf-json-reporter', { outputFile: 'script.json', outputDir: path.join(runDir, 'ctrf') }],
    ],
    use: {
      baseURL,
      locale: cfg.locale,
      timezoneId: cfg.timezoneId,
      viewport: cfg.viewport ?? { width: 390, height: 844 },
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      storageState,
      qaService: cfg,
      qaServiceDir: serviceDir,
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  });
}

import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '@mc-qa/fixtures';
import type { HumanAnswer } from '@mc-qa/fixtures';
import {
  assertDocumentRTL,
  assertFontLoaded,
  assertNoArabicYehKaf,
  assertNoHorizontalOverflow,
  assertNoTofu,
  assertPersianDigits,
} from '@mc-qa/assertions';
import { findTaskById, pickLang, type RunPlan, type Task, type TaskStep } from '@mc-qa/core';
import { SelectorMemory } from '@mc-qa/selector-memory';

export interface StepContext {
  page: Page;
  context: BrowserContext;
  task: Task;
  step: TaskStep;
  testInfo: TestInfo;
  memory: SelectorMemory;
  locate: (key: string) => Promise<Locator>;
  consoleViolations: () => Array<{ type: string; text: string }>;
  networkViolations: () => Array<{ url: string; kind: string }>;
  wsSockets: () => Array<{ url: string; framesReceived: number }>;
  readVitals: () => Promise<Record<string, number>>;
  promptHuman: (prompt: string) => Promise<HumanAnswer>;
  expect: typeof expect;
}

export type CustomStepFn = (ctx: StepContext) => Promise<void>;

export interface TaskSuiteOptions {
  serviceDir: string;
  /** Service-specific custom step functions, referenced by tasks as {"action":"custom","fn":"name"}. */
  steps?: Record<string, CustomStepFn>;
}

function resolveTasks(serviceDir: string): Task[] {
  const planFile = process.env.QA_PLAN;
  if (planFile) {
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8')) as RunPlan;
    return plan.entries.filter((e) => e.lane === 'script').map((e) => plan.tasks[e.taskId]);
  }
  const taskId = process.env.QA_TASK;
  if (taskId) return [findTaskById(serviceDir, taskId).task];
  throw new Error(
    'No QA_PLAN or QA_TASK set. Run via `pnpm qa run --service <svc> ...` — ' +
      'or for a single-task dev loop: QA_TASK=<id> npx playwright test --config apps/<svc>/playwright.config.ts',
  );
}

/**
 * The ONE parametrized spec per service: turns each planned JSON task into a test()
 * and interprets the step DSL. Tasks stay data; anything complex is a `custom` step
 * function registered in the service's specs/steps/.
 */
export function defineTaskSuite(opts: TaskSuiteOptions): void {
  let tasks: Task[];
  try {
    tasks = resolveTasks(opts.serviceDir);
  } catch (e) {
    test('mc-qa suite configuration', () => {
      throw e;
    });
    return;
  }

  const isLoggedOut = (t: Task) =>
    (t.procedure.preconditions ?? []).some((p) => p.kind === 'account-state' && /logged.?out/i.test(p.value));

  // Each planned task → one test(). Logged-out tasks (account-state precondition) run in a
  // fresh, empty-storageState context below so an authenticated session can't redirect
  // /login → /root (that made login-page-reachable fail every --authenticated run).
  const emit = (task: Task) => {
    test(
      `${task.id} — ${pickLang(task.title, 'en')}`,
      {
        annotation: [
          { type: 'mc-qa:risk', description: task.risk.class },
          { type: 'mc-qa:executor', description: task.automation.executor },
          { type: 'mc-qa:category', description: task.classification.category },
          ...(isLoggedOut(task) ? [{ type: 'mc-qa:context', description: 'fresh-logged-out' }] : []),
        ],
      },
      async (
        { page, context, consoleCapture, networkCapture, wsCapture, selectorMemory, vitals, promptHuman },
        testInfo,
      ) => {
        testInfo.setTimeout((task.schedule.timeoutSec ?? 120) * 1000);
        // Visual tasks can never produce a comparison on a non-Linux host (baselines are
        // Docker/Linux only for font determinism). Skip BEFORE the step loop so the task
        // doesn't generate load and flake at an earlier step (e.g. appShellRendered) for a
        // run that had no possible passing outcome here. Same decision as the per-step guard
        // at 'screenshotCompare', taken sooner; the per-step guard stays as defense in depth.
        if (
          task.procedure.steps.some((s) => s.action === 'screenshotCompare') &&
          process.platform !== 'linux' &&
          process.env.QA_ALLOW_HOST_VISUAL !== '1'
        ) {
          test.skip(
            true,
            'visual baselines are rendered in Docker/Linux only (font determinism) — use --docker, or --allow-host-visual to override deliberately',
          );
        }
        const ctx: StepContext = {
          page,
          context,
          task,
          step: task.procedure.steps[0],
          testInfo,
          memory: selectorMemory,
          locate: (key) => selectorMemory.locate(page, key),
          consoleViolations: () => consoleCapture.violations(),
          networkViolations: () => networkCapture.violations(),
          wsSockets: () => wsCapture.sockets,
          readVitals: () => vitals.read(page),
          promptHuman: (prompt) => promptHuman(page, prompt),
          expect,
        };

        for (const step of task.procedure.steps) {
          ctx.step = step;
          await test.step(`${step.n}. ${step.action}`, async () => {
            await runStep(ctx, opts.steps ?? {});
          });
        }
      },
    );
  };

  for (const task of tasks.filter((t) => !isLoggedOut(t))) emit(task);
  const loggedOut = tasks.filter(isLoggedOut);
  if (loggedOut.length) {
    test.describe('logged-out (fresh context)', () => {
      test.use({ storageState: { cookies: [], origins: [] } });
      for (const task of loggedOut) emit(task);
    });
  }
}

async function attachEvidence(ctx: StepContext): Promise<void> {
  for (const kind of ctx.step.evidence ?? []) {
    if (kind === 'screenshot' || kind === 'screenshot-full-page') {
      const shot = await ctx.page.screenshot({ fullPage: kind === 'screenshot-full-page' });
      await ctx.testInfo.attach(`step-${ctx.step.n}-${kind}`, { body: shot, contentType: 'image/png' });
    }
  }
}

async function runStep(ctx: StepContext, custom: Record<string, CustomStepFn>): Promise<void> {
  const { page, context, step } = ctx;

  // Hybrid tasks: human steps pause for the in-page prompt; agent steps are handled
  // by the agent lane, not here — record and continue.
  if (step.executor === 'human') {
    const answer = await ctx.promptHuman(step.prompt ?? step.action);
    if (answer.status === 'manual-pending') {
      test.skip(true, `human step ${step.n} pending — run attended/headed or via qa interview`);
    }
    expect(answer.status, `human verdict on step ${step.n}: ${answer.notes ?? ''}`).toBe('pass');
    await attachEvidence(ctx);
    return;
  }
  if (step.executor === 'agent') {
    ctx.testInfo.annotations.push({
      type: 'mc-qa:agent-step-deferred',
      description: `step ${step.n} "${step.action}" is judged by the agent lane`,
    });
    return;
  }

  switch (step.action) {
    case 'goto':
      await page.goto(step.target ?? '/', { waitUntil: 'domcontentloaded' });
      break;
    case 'waitForLoadState':
      await page.waitForLoadState((step.data?.state as 'load' | 'networkidle' | undefined) ?? 'load');
      break;
    case 'click':
      await (await ctx.locate(step.locator!)).click();
      break;
    case 'fill':
      await (await ctx.locate(step.locator!)).fill(String(step.data?.value ?? ''));
      break;
    case 'press':
      await page.keyboard.press(String(step.data?.key ?? 'Enter'));
      break;
    case 'expectVisible':
      await expect(await ctx.locate(step.locator!)).toBeVisible();
      break;
    case 'expectHidden':
      await expect(await ctx.locate(step.locator!)).toBeHidden();
      break;
    case 'expectText':
      await expect(await ctx.locate(step.locator!)).toContainText(step.text ?? '');
      break;
    case 'expectUrl':
      await expect(page).toHaveURL(new RegExp(step.data?.pattern as string));
      break;
    case 'assertDocumentRTL':
      await assertDocumentRTL(page);
      break;
    case 'assertNoHorizontalOverflow':
      await assertNoHorizontalOverflow(page);
      break;
    case 'assertFontLoaded':
      if (!step.font) throw new Error(`assertFontLoaded step ${step.n} requires a "font" family name (task ${ctx.task.id})`);
      await assertFontLoaded(page, step.font);
      break;
    case 'assertPersianDigits':
      await assertPersianDigits(await ctx.locate(step.locator!));
      break;
    case 'assertNoTofu':
      await assertNoTofu(page);
      break;
    case 'assertNoArabicYehKaf':
      await assertNoArabicYehKaf(page);
      break;
    case 'assertNoConsoleErrors': {
      const violations = ctx.consoleViolations();
      expect(
        violations,
        `console errors (after allowlist):\n${violations.map((v) => `  [${v.type}] ${v.text}`).join('\n')}`,
      ).toHaveLength(0);
      break;
    }
    case 'assertNoFailedRequests': {
      const violations = ctx.networkViolations();
      expect(
        violations,
        `first-party network failures:\n${violations.map((v) => `  [${v.kind}] ${v.url}`).join('\n')}`,
      ).toHaveLength(0);
      break;
    }
    case 'expectWsActive': {
      const minFrames = Number(step.data?.minFrames ?? 1);
      const timeoutMs = Number(step.data?.timeoutMs ?? 20_000);
      const deadline = Date.now() + timeoutMs;
      let ok = false;
      while (Date.now() < deadline) {
        if (ctx.wsSockets().some((s) => s.framesReceived >= minFrames)) { ok = true; break; }
        await page.waitForTimeout(500);
      }
      expect(
        ok,
        `no WebSocket received >= ${minFrames} frames within ${timeoutMs}ms — ` +
          `sockets: ${JSON.stringify(ctx.wsSockets())}`,
      ).toBe(true);
      break;
    }
    case 'screenshotCompare': {
      if (process.platform !== 'linux' && process.env.QA_ALLOW_HOST_VISUAL !== '1') {
        test.skip(
          true,
          'visual baselines are rendered in Docker/Linux only (font determinism) — use --docker, or --allow-host-visual to override deliberately',
        );
      }
      await expect(page).toHaveScreenshot(`${step.name ?? ctx.task.id}.png`, { fullPage: step.data?.fullPage === true });
      break;
    }
    case 'axeScan': {
      const impacts = (step.data?.impacts as string[] | undefined) ?? ['critical', 'serious'];
      // @axe-core/playwright bundles its own playwright-core types; structurally compatible.
      const results = await new AxeBuilder({ page: page as never }).analyze();
      const violations = results.violations.filter((v) => impacts.includes(v.impact ?? ''));
      await ctx.testInfo.attach('axe-report', {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });
      expect(
        violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}`),
        'axe violations at or above the configured impact level',
      ).toHaveLength(0);
      break;
    }
    case 'setOffline':
      await context.setOffline(step.data?.offline !== false);
      break;
    case 'custom': {
      const fn = custom[step.fn ?? ''];
      if (!fn) {
        throw new Error(
          `custom step fn "${step.fn}" not registered — add it to the service's specs/steps/ and pass it to defineTaskSuite()`,
        );
      }
      await fn(ctx);
      break;
    }
    default:
      throw new Error(`unknown step action "${step.action}" (task ${ctx.task.id}, step ${step.n})`);
  }
  await attachEvidence(ctx);
}

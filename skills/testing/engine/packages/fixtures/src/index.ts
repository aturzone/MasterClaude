import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { ServiceConfig } from '@mc-qa/core';
import { SelectorMemory } from '@mc-qa/selector-memory';
import { ConsoleCapture, NetworkCapture, WsCapture, allowlistsFrom } from './captures.ts';
import { promptHumanInPage, type HumanAnswer } from './human.ts';
import { installWebVitals, readWebVitals } from './vitals.ts';

export interface QaFixtures {
  /** Set by defineServiceConfig() via `use` — available to every fixture and test. */
  qaService: ServiceConfig | undefined;
  qaServiceDir: string;

  consoleCapture: ConsoleCapture;
  networkCapture: NetworkCapture;
  wsCapture: WsCapture;
  selectorMemory: SelectorMemory;
  /** Injects web-vitals into the context; read metrics with `vitals.read(page)`. */
  vitals: { install: (ctx: BrowserContext) => Promise<void>; read: (page: Page) => Promise<Record<string, number>> };
  promptHuman: (page: Page, prompt: string) => Promise<HumanAnswer>;
  /** Layer-2 risk gate: re-checks QA_ALLOWED_RISK inside every test. Auto. */
  riskGuard: void;
}

export const test = base.extend<QaFixtures>({
  qaService: [undefined, { option: true }],
  qaServiceDir: ['', { option: true }],

  consoleCapture: [
    async ({ page, qaService }, use, testInfo) => {
      const capture = new ConsoleCapture(allowlistsFrom(qaService).consoleAllow);
      capture.attachTo(page);
      await use(capture);
      await capture.flush(testInfo);
    },
    { auto: true },
  ],

  networkCapture: [
    async ({ page, baseURL, qaService }, use, testInfo) => {
      let origin: string | undefined;
      try {
        origin = baseURL ? new URL(baseURL).origin : undefined;
      } catch {
        origin = undefined;
      }
      const capture = new NetworkCapture(allowlistsFrom(qaService).requestAllow, origin);
      capture.attachTo(page);
      await use(capture);
      await capture.flush(testInfo);
    },
    { auto: true },
  ],

  wsCapture: [
    async ({ page }, use, testInfo) => {
      const capture = new WsCapture();
      capture.attachTo(page);
      await use(capture);
      await capture.flush(testInfo);
    },
    { auto: true },
  ],

  selectorMemory: async ({ qaServiceDir }, use, testInfo) => {
    const memory = new SelectorMemory(qaServiceDir);
    await use(memory);
    if (memory.telemetry.length > 0) {
      await testInfo.attach('selector-telemetry', {
        body: JSON.stringify(memory.telemetry, null, 2),
        contentType: 'application/json',
      });
    }
  },

  vitals: async ({}, use) => {
    await use({ install: installWebVitals, read: readWebVitals });
  },

  promptHuman: async ({ headless }, use) => {
    await use((page, prompt) => promptHumanInPage(page, prompt, { headed: headless === false }));
  },

  riskGuard: [
    async ({}, use, testInfo) => {
      const annotation = testInfo.annotations.find((a) => a.type === 'mc-qa:risk');
      const cls = annotation?.description ?? '?';
      if (annotation) {
        const allowed = (process.env.QA_ALLOWED_RISK ?? 'a').split(',').map((s) => s.trim());
        if (!allowed.includes(cls)) {
          throw new Error(
            `RISK GUARD: task risk class "${cls}" exceeds QA_ALLOWED_RISK="${allowed.join(',')}". ` +
              `Run through "pnpm qa run" so the env-profile gate decides, or set QA_ALLOWED_RISK deliberately.`,
          );
        }
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export { ConsoleCapture, NetworkCapture, WsCapture } from './captures.ts';
export type { HumanAnswer } from './human.ts';
export { installWebVitals, readWebVitals } from './vitals.ts';

import type { CustomStepFn } from '@mc-qa/runner/playwright';

/**
 * Service-specific custom steps, referenced by tasks as {"action":"custom","fn":"<name>"}.
 * Start with a generic "page rendered" check; add more as the service needs them.
 */
export const steps: Record<string, CustomStepFn> = {
  async pageRendered({ page, expect }) {
    await expect
      .poll(async () => page.evaluate(() => document.body.innerText.trim().length), {
        message: 'page never rendered readable content (blank screen)',
        timeout: 30_000,
      })
      .toBeGreaterThan(20);
  },
};

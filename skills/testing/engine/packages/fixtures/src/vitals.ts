import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { BrowserContext, Page } from '@playwright/test';

let iifeCache: string | undefined;

function webVitalsIife(): string {
  if (iifeCache) return iifeCache;
  const require = createRequire(import.meta.url);
  const entry = require.resolve('web-vitals');
  const iifePath = path.join(path.dirname(entry), 'web-vitals.iife.js');
  iifeCache = fs.readFileSync(iifePath, 'utf8');
  return iifeCache;
}

/**
 * Inject the web-vitals library into every page of the context and collect
 * field-style Core Web Vitals from the user's side of the browser.
 */
export async function installWebVitals(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    webVitalsIife() +
      `;(() => {
        const store = (window.__mcqaVitals = {});
        try {
          webVitals.onLCP((m) => (store.LCP = m.value), { reportAllChanges: true });
          webVitals.onCLS((m) => (store.CLS = m.value), { reportAllChanges: true });
          webVitals.onINP((m) => (store.INP = m.value), { reportAllChanges: true });
          webVitals.onFCP((m) => (store.FCP = m.value));
          webVitals.onTTFB((m) => (store.TTFB = m.value));
        } catch (e) { store.error = String(e); }
      })();`,
  );
}

export async function readWebVitals(page: Page): Promise<Record<string, number>> {
  return (await page.evaluate(
    () => (window as typeof window & { __mcqaVitals?: Record<string, number> }).__mcqaVitals ?? {},
  )) as Record<string, number>;
}

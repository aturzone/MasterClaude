import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import type { SelectorMap } from '@mc-qa/core';

export interface VerifyReport {
  verified: string[];
  stale: string[];
  /** Entries whose stability dropped below 0.6 — flagged for review. */
  lowStability: string[];
  skippedPages: string[];
}

/**
 * Nightly job: re-resolve every element entry against the live app, update
 * hits/misses/stability/lastVerified, and mark entries "stale" when they miss.
 * Only maps with a `path` are verifiable without auth; others are skipped.
 */
export async function verifySelectors(serviceDir: string, baseURL: string): Promise<VerifyReport> {
  const dir = path.join(serviceDir, 'selector-memory');
  const report: VerifyReport = { verified: [], stale: [], lowStability: [], skippedPages: [] };
  if (!fs.existsSync(dir)) return report;
  const today = new Date().toISOString().slice(0, 10);

  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const file = path.join(dir, f);
      const map = JSON.parse(fs.readFileSync(file, 'utf8')) as SelectorMap;
      if (!map.path) {
        report.skippedPages.push(map.page);
        continue;
      }
      await page.goto(new URL(map.path, baseURL).href, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      for (const [name, entry] of Object.entries(map.entries)) {
        if (entry.kind !== 'element') continue;
        const key = `${map.page}.${name}`;
        let found = false;
        const candidates: Array<() => Promise<number>> = [];
        if (entry.role && entry.name) {
          candidates.push(() =>
            page.getByRole(entry.role as never, { name: entry.name }).count(),
          );
        }
        if (entry.selector) candidates.push(() => page.locator(entry.selector!).count());
        for (const fb of entry.fallbacks ?? []) candidates.push(() => page.locator(fb).count());
        for (const c of candidates) {
          try {
            if ((await c()) > 0) { found = true; break; }
          } catch { /* bad selector syntax — treat as miss */ }
        }
        entry.hits = (entry.hits ?? 0) + (found ? 1 : 0);
        entry.misses = (entry.misses ?? 0) + (found ? 0 : 1);
        const total = entry.hits + entry.misses;
        entry.stability = total ? Number((entry.hits / total).toFixed(2)) : undefined;
        entry.lastVerified = today;
        if (found) {
          if (entry.state !== 'candidate') entry.state = 'verified';
          report.verified.push(key);
        } else {
          entry.state = 'stale';
          report.stale.push(key);
        }
        if (typeof entry.stability === 'number' && entry.stability < 0.6) report.lowStability.push(key);
      }
      fs.writeFileSync(file, JSON.stringify(map, null, 2) + '\n');
    }
  } finally {
    await browser.close();
  }
  return report;
}

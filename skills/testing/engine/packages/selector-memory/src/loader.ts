import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { SelectorEntry, SelectorMap } from '@mc-qa/core';

export interface TelemetryRecord {
  key: string;
  outcome: 'hit' | 'miss';
  via?: 'role' | 'selector' | 'fallback';
}

/**
 * Per-service selector memory: one JSON map per page under selector-memory/.
 * Scripts resolve locators through here; agents read the same files (inlined
 * into their briefs), so both share one set of learned element knowledge.
 */
export class SelectorMemory {
  private maps = new Map<string, { map: SelectorMap; file: string }>();
  readonly telemetry: TelemetryRecord[] = [];

  constructor(readonly serviceDir: string) {
    const dir = path.join(serviceDir, 'selector-memory');
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const file = path.join(dir, f);
      const map = JSON.parse(fs.readFileSync(file, 'utf8')) as SelectorMap;
      this.maps.set(map.page, { map, file });
    }
  }

  entry(key: string): { entry: SelectorEntry; file: string } {
    const dot = key.indexOf('.');
    if (dot < 0) throw new Error(`Selector key "${key}" must be "<page>.<name>"`);
    const pageName = key.slice(0, dot);
    const name = key.slice(dot + 1);
    const holder = this.maps.get(pageName);
    if (!holder) {
      throw new Error(
        `No selector map for page "${pageName}" (key "${key}"). ` +
          `Expected ${path.join(this.serviceDir, 'selector-memory', `${pageName}.json`)}`,
      );
    }
    const entry = holder.map.entries[name];
    if (!entry) {
      throw new Error(`Selector key "${key}" not found in ${holder.file}`);
    }
    return { entry, file: holder.file };
  }

  /** Regex for kind:"url-pattern" entries (API/WS endpoints). */
  urlPattern(key: string): RegExp {
    const { entry, file } = this.entry(key);
    if (entry.kind !== 'url-pattern' || !entry.urlPattern) {
      throw new Error(`Selector key "${key}" in ${file} is not a url-pattern entry`);
    }
    return new RegExp(entry.urlPattern);
  }

  /**
   * Resolve an element key to a Locator: role+name first (survives DOM churn,
   * reads naturally to agents), then the primary selector, then fallbacks.
   * Records hit/miss telemetry for the nightly stability job.
   */
  async locate(page: Page, key: string): Promise<Locator> {
    const { entry, file } = this.entry(key);
    if (entry.kind !== 'element') {
      throw new Error(`Selector key "${key}" is kind "${entry.kind}", not an element`);
    }
    const candidates: Array<{ via: TelemetryRecord['via']; loc: Locator }> = [];
    if (entry.role) {
      const role = entry.role as Parameters<Page['getByRole']>[0];
      candidates.push({
        via: 'role',
        loc: entry.name ? page.getByRole(role, { name: entry.name }) : page.getByRole(role),
      });
    }
    if (entry.selector) candidates.push({ via: 'selector', loc: page.locator(entry.selector) });
    for (const fb of entry.fallbacks ?? []) {
      candidates.push({ via: 'fallback', loc: page.locator(fb) });
    }
    if (candidates.length === 0) {
      throw new Error(`Selector key "${key}" in ${file} has neither role+name nor selector`);
    }
    for (const c of candidates) {
      try {
        if ((await c.loc.count()) > 0) {
          this.telemetry.push({ key, outcome: 'hit', via: c.via });
          return c.loc.first();
        }
      } catch {
        // invalid selector syntax in a fallback should not kill resolution
      }
    }
    this.telemetry.push({ key, outcome: 'miss' });
    throw new Error(
      `Selector key "${key}" did not resolve on ${page.url()}.\n` +
        `  description: ${entry.description}\n` +
        `  tried: ${candidates.map((c) => c.via).join(', ')}\n` +
        `  fix the entry in ${file} (or let an agent heal it — see docs/workflows.md w6)`,
    );
  }

  pages(): Array<{ page: string; path?: string; file: string }> {
    return [...this.maps.values()].map(({ map, file }) => ({ page: map.page, path: map.path, file }));
  }
}

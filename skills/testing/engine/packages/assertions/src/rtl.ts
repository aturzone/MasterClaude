import { expect, type Page } from '@playwright/test';

/** Optional RTL check: the document must be a real right-to-left document, not LTR with
 * right-aligned text. Enable per-project for apps that render a right-to-left locale. */
export async function assertDocumentRTL(page: Page): Promise<void> {
  const info = await page.evaluate(() => ({
    dir: document.documentElement.getAttribute('dir'),
    computed: getComputedStyle(document.documentElement).direction,
    lang: document.documentElement.getAttribute('lang'),
  }));
  expect(info.computed, 'computed direction of <html> must be rtl').toBe('rtl');
  expect(info.dir, '<html dir> attribute should be "rtl"').toBe('rtl');
  // A right-to-left document should declare a right-to-left locale (Arabic, Persian, Hebrew, Urdu, …).
  expect(info.lang ?? '', '<html lang> should declare a right-to-left locale').toMatch(/^(ar|fa|he|iw|ur|ps|sd|ug|yi|dv|ckb|ku)\b/);
}

/**
 * The classic RTL bug: horizontal overflow. The page body must not scroll sideways.
 */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    o.scrollWidth,
    `horizontal overflow: scrollWidth ${o.scrollWidth} > clientWidth ${o.clientWidth}`,
  ).toBeLessThanOrEqual(o.clientWidth + 1);
}

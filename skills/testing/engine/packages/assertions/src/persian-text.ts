// OPTIONAL Persian/Arabic-script helpers (part of the opt-in @mc-qa/assertions i18n module).
// Enable these per-project only for apps that render Persian/Arabic text; the core engine defaults
// to latin digits and never applies these automatically.
import { expect, type Locator, type Page } from '@playwright/test';

export const PERSIAN_DIGITS = /[۰-۹]/;
export const LATIN_DIGITS = /[0-9]/;
export const ARABIC_DIGITS = /[٠-٩]/;
/** Arabic yeh/kaf that must never appear in Persian copy (use ی/ک). */
export const ARABIC_YEH_KAF = /[يك]/;
export const ZWNJ = '‌';

export function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Numeric text (prices, amounts) must use Persian digits per the service digit policy. */
export async function assertPersianDigits(locator: Locator): Promise<void> {
  const text = (await locator.textContent()) ?? '';
  expect(text.trim().length, 'element has no text to check digits in').toBeGreaterThan(0);
  expect(PERSIAN_DIGITS.test(text), `expected Persian digits in "${text}"`).toBe(true);
}

/**
 * No tofu / replacement characters anywhere in the rendered body text —
 * catches missing glyphs and broken encodings.
 */
export async function assertNoTofu(page: Page): Promise<void> {
  const bad = await page.evaluate(() => {
    const text = document.body.innerText;
    const hits: string[] = [];
    for (const ch of text) {
      if (ch === '�') hits.push('U+FFFD replacement char');
    }
    return hits.slice(0, 5);
  });
  expect(bad, `tofu/replacement characters found: ${bad.join(', ')}`).toHaveLength(0);
}

/** Persian copy must use Persian ی/ک — Arabic ي/ك means broken keyboard/CMS content. */
export async function assertNoArabicYehKaf(page: Page): Promise<void> {
  const sample = await page.evaluate(() => {
    const text = document.body.innerText;
    const m = text.match(/[يك]/);
    if (!m || m.index === undefined) return null;
    return text.slice(Math.max(0, m.index - 20), m.index + 20);
  });
  expect(sample, `Arabic ي/ك found in Persian copy near: "${sample}"`).toBeNull();
}

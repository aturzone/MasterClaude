import { expect, type Page } from '@playwright/test';

/**
 * Assert a webfont actually loaded (document.fonts), i.e. the UI is not silently
 * falling back to a system font.
 */
export async function assertFontLoaded(page: Page, family: string): Promise<void> {
  const loaded = await page.evaluate(async (fam) => {
    await document.fonts.ready;
    if (document.fonts.check(`16px "${fam}"`)) return true;
    // check() can be false before any glyph of the family was used; look at FontFace set too.
    for (const f of document.fonts) {
      if (f.family.replace(/["']/g, '') === fam && f.status === 'loaded') return true;
    }
    return false;
  }, family);
  expect(loaded, `webfont "${family}" is not loaded — UI is rendering with a fallback font`).toBe(true);
}

/** Which font families the app declares on <body> (diagnostic helper for reports). */
export async function bodyFontStack(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).fontFamily);
}

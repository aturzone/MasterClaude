import { expect, type Locator } from '@playwright/test';

/**
 * Optional bidi check: left-to-right values (account numbers, IBANs, hashes, IDs, URLs) embedded
 * in a right-to-left page must be LTR-isolated, otherwise the bidi algorithm scrambles them visually.
 */
export async function assertLTRIsolated(locator: Locator): Promise<void> {
  const info = await locator.evaluate((el) => {
    const cs = getComputedStyle(el as HTMLElement);
    const tag = (el as HTMLElement).tagName.toLowerCase();
    const dirAttr = (el as HTMLElement).getAttribute('dir');
    return {
      direction: cs.direction,
      unicodeBidi: cs.unicodeBidi,
      tag,
      dirAttr,
    };
  });
  const isolated =
    info.direction === 'ltr' ||
    info.dirAttr === 'ltr' ||
    info.tag === 'bdi' ||
    ['isolate', 'isolate-override', 'bidi-override', 'embed', 'plaintext'].includes(info.unicodeBidi);
  expect(
    isolated,
    `element <${info.tag}> holding an LTR value (address/IBAN/hash) is not LTR-isolated ` +
      `(direction=${info.direction}, unicode-bidi=${info.unicodeBidi}, dir=${info.dirAttr})`,
  ).toBe(true);
}

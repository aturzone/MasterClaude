// OPTIONAL Jalali (Persian) calendar helpers (part of the opt-in @mc-qa/assertions i18n module).
// Enable per-project only for apps that display Jalali dates; the core engine is calendar-neutral.
import * as jalaali from 'jalaali-js';
import { toLatinDigits } from './persian-text.ts';

export interface JalaliParts {
  jy: number;
  jm: number;
  jd: number;
}

/** Convert a Date to Jalali parts in the Asia/Tehran timezone (the Jalali calendar's reference clock). */
export function toJalaliTehran(date: Date): JalaliParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [gy, gm, gd] = fmt.format(date).split('-').map(Number);
  const j = jalaali.toJalaali(gy, gm, gd);
  return { jy: j.jy, jm: j.jm, jd: j.jd };
}

/**
 * Second, independent oracle via Intl's Persian calendar — the two must agree,
 * which protects the test itself from conversion bugs.
 */
export function toJalaliIntl(date: Date): JalaliParts {
  const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { jy: Number(parts.year), jm: Number(parts.month), jd: Number(parts.day) };
}

/** Does the given UI text contain this Jalali date (Persian or Latin digits, any common separator)? */
export function textContainsJalaliDate(text: string, j: JalaliParts): boolean {
  const t = toLatinDigits(text);
  const patterns = [
    `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`,
    `${j.jy}/${j.jm}/${j.jd}`,
    `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}`,
  ];
  return patterns.some((p) => t.includes(p));
}

/**
 * `@mc-qa/assertions` — OPTIONAL internationalization / RTL assertion helpers.
 *
 * The core QA engine is English-first and locale-neutral by default; this module is opt-in, enabled
 * per project for apps that need to verify a specific locale. It ships:
 *  - `rtl` / `bidi`   — right-to-left layout + bidi-isolation checks (any RTL locale);
 *  - `fonts`          — webfont-loaded / no-fallback checks;
 *  - `persian-text`   — Persian/Arabic digit + character helpers (a Persian-language example);
 *  - `jalali`         — Jalali (Persian) calendar date helpers.
 *
 * Nothing here is applied automatically — a task opts in via the corresponding step-DSL verb or by
 * importing a helper directly. The Persian-specific helpers are one worked example of locale support;
 * a project targeting another locale would add its own alongside them.
 */
export * from './rtl.ts';
export * from './fonts.ts';
export * from './persian-text.ts';
export * from './jalali.ts';
export * from './bidi.ts';

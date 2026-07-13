# Testing standards

## Black-box, end-user only
Everything is tested as a real user experiences it — UI/UX, clickability, fonts/RTL, DevTools
signals (console/network/WebSocket), Lighthouse, PWA install/offline, a11y, visual, SEO. No
application source, no test hooks baked into the product.

## Canvas-rendered apps (e.g. Flutter Web)
If a surface renders to a **canvas** (e.g. CanvasKit) instead of the DOM, standard DOM assertions
silently pass on nothing. This is load-bearing:

- `document.body.innerText` is **empty** — never assert on it. Use the **accessibility /
  semantics tree** (`getByRole`) and, for text quality, **screenshots judged by an agent**.
- `<html dir>` can be **null** even when the canvas itself renders RTL (the framework draws
  direction on the canvas, not the DOM); assert `<html lang>` matches the expected locale and
  check for no horizontal overflow instead. True mirroring → visual baseline + agent nav-map.
- `document.fonts` can be empty — verify a webfont by a **woff2/ttf/otf resource request**.
- Click any "Enable accessibility" placeholder (e.g. Flutter's `enableFlutterSemantics` step)
  before role-based lookups to populate the full semantics tree.

Other surfaces (marketing site, blog, docs) are usually normal HTML — the DOM-based helpers in
`@mc-qa/assertions` (`assertDocumentRTL`, `assertNoTofu`, …) apply there directly.

## Locale, i18n & RTL oracles (optional, per-project)
Latin digits and the default `Intl` locale are assumed unless a project opts in to something
else. `@mc-qa/assertions` exposes optional checks a service enables in its own `specs/steps/`
when its product actually needs them:

- **Digits & separators** — if the product accepts or renders localized digits (e.g. Arabic-Indic
  digits) or a non-Latin thousands/decimal separator, add an assertion for the specific script
  and separators the product supports; inputs should accept both the localized and Latin forms.
- **RTL / bidi isolation** — for a right-to-left UI, LTR-isolate embedded codes/IDs (order
  numbers, addresses, hashes, tickers, tracking numbers) so they don't visually scramble inside
  RTL text.
- **Locale dates** — if the product renders a non-Gregorian or locale-specific calendar, verify
  it against the equivalent `Intl` calendar/timezone rather than hand-rolling the conversion.

These are opt-in per project, not a default assumption about any particular language or locale.

## Allowlists — narrow and documented
`service.config.ts` carries `consoleErrorAllowlist` / `failedRequestAllowlist` for **third-party**
noise only (e.g. a known-noisy analytics SDK, an ad- or tracker-blocker false positive). **Never
allowlist a first-party error** to make a test pass — quarantine the task and file a finding
instead (see `docs/workflows.md` w5).

## Visual baselines live in Docker only
Font rasterization differs by OS. Baselines are rendered on Linux/Docker and committed; the
`screenshotCompare` step **self-skips on the Windows host** unless `--allow-host-visual` is
passed. The snapshot name embeds `{projectName}-{platform}` so mixed baselines never collide.

## Naming & hygiene
- Task IDs are immutable and embed the taxonomy path.
- Every `active` task belongs to exactly one checklist section (or `unscheduled` with a reason).
- Quarantine (`status: quarantined` + `quarantinedUntil` ≤ 30 days) is the honest state for a
  reproducible-but-ambiguous finding — it is gate-refused but stays visible; the validator nags
  when the date passes.
- Prefer `getByRole` + accessible name over CSS. Accessible names are canonical.

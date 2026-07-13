# Test taxonomy

The catalog of end-user, black-box test categories. The machine-readable source of truth is
`packages/core/src/schemas/taxonomy.json` (each node has a title, default executor, default
human-involvement score, and example checks). Task IDs embed the category path, so
`pnpm qa coverage --service <s>` mechanically lists categories with **no** active task — a
direct radar against "we forgot a whole class of test".

## Category tree

- **smoke** — app loads at all.
- **func.** — feature flows: `auth` (registration/login/session) · `crud` (create/read/update/
  delete a record) · `search` (search & filtering) · `settings` (account & preferences) ·
  `notify` (notifications).
- **input** — forms & validation (required/format checks, paste of formatted values, boundaries,
  max-length).
- **nav** — deep links, back button, F5-restore, 404, redirect-after-login.
- **ui.** — `click` (dead elements, ≥44px targets, double-submit) · `heuristics` (agent-judged
  UX) · `visual` (screenshot diffs) · `responsive` (viewport matrix, safe-area) · `states`
  (empty/error/maintenance) · `content` (copy, broken images).
- **i18n.** — `rtl` (mirroring, bidi isolation — optional, for right-to-left locales) ·
  `typography` (webfont, glyph fallback, tabular figures) · `locale` (date/number/timezone
  formatting).
- **pwa** — manifest, install, offline shell, SW update, icons/splash.
- **perf** — Lighthouse budgets, CWV, slow-network, bundle weight, memory soak.
- **net** — injected API failures → UI states, 401 handling, retry/backoff, WS parse/reconnect/stale.
- **console** — zero errors on key routes, no PII in logs, no unhandled rejections.
- **a11y** — axe (critical/serious), keyboard order, focus traps, aria-live, AA contrast.
- **sec** — observational only: headers/CSP/cookies/TLS, no secrets in storage/console, SW cache hygiene.
- **seo** — public pages: meta/OG/canonical/sitemap/robots, broken links.
- **resil.** — `interrupt` (offline mid-flow, tab restore, session timeout) · `persist`
  (theme/favorites/selection persistence, drafts cleared on logout).
- **fuzz** — monkey/gremlins, unicode/RTL-override input corpus, nav storms.
- **xbrowser** — chromium/firefox/webkit smoke; webkit inputmode/100vh.
- **data** — live-value sanity (tolerance vs external refs), sane thresholds, stale detector, sort correctness.
- **trust** — critical-action confirmation UX: cost/consequence disclosure before point-of-no-return,
  confirm == receipt == history, validity countdowns, emergency/undo discoverability.

Each subcategory ships a **default executor** and **default human-involvement** in
`taxonomy.json`; `qa task new` seeds a new task from those defaults. Adding a genuinely new
category is a deliberate PR to `taxonomy.json` first.

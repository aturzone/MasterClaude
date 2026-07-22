---
name: test-blackbox
description: >-
  Test a deployed surface from the outside as a black box — no source, no test hooks: functional
  smoke, visual regression, accessibility (axe), performance (Lighthouse), SEO, PWA (manifest/service
  worker/offline), broken links, and console/network errors. Triggers on "black-box test", "test the
  live site", "check the deployed app", "lighthouse/a11y/seo audit of the site". Not for unit tests.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# test-blackbox — outside-in, no hooks

Exercise a running surface exactly as the outside world sees it — DOM/semantics, network, and
rendering — with zero access to the app's source or test seams. Part of the `wf-tester` team; runs on
the engine's **script lane** (Playwright) + **CLI lane** (Lighthouse, link crawler) + optional Docker
security/visual sidecars.

## What to cover
- **Functional smoke** — the key pages/endpoints load, respond, and show the right thing (assert via role/semantics + network signals, not brittle text).
- **Visual regression** — baseline screenshots (rendered in Docker for font determinism; host runs self-skip unless `--allow-host-visual`).
- **Accessibility** — `@axe-core/playwright` per page; report violations by impact.
- **Performance** — Lighthouse (LHCI) budgets; flag regressions.
- **SEO** — crawl for meta/titles/canonical/sitemap, broken links (linkinator).
- **PWA** — manifest valid, service worker active, offline shell.
- **Hygiene** — no unexpected console errors, no failed requests (allowlists are for third-party noise only — never allowlist a first-party error to make a test pass; quarantine + file a finding instead).

## How
1. `cd .claude/skills/testing/engine && pnpm qa scaffold-service <name> --url <baseURL>` (or reuse the target).
2. Run: `pnpm qa run --service <name> --env <profile> [--section s01-smoke] [--docker]`.
3. Security sidecars (optional, Docker): testssl, HTTP Observatory, ZAP baseline (passive) — targets come from `MC_QA_TARGET_URL`.
4. Merge + report: `pnpm qa report --run <id>`; unresolved gaps become tracked findings under `.skull/qa/findings/`.

## Note on canvas apps
Some apps paint to a `<canvas>` (e.g. Flutter Web) — the DOM is empty. Assert via the accessibility
tree, network/resource signals, screenshots, or agent judgment, never `innerText`.

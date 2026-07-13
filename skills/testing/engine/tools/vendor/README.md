# Vendored assets

Files here are checked into git deliberately (not npm dependencies), because the upstream
package is dormant or we need byte-stable, offline-safe copies.

- **gremlins.min.js** — the monkey/fuzz horde for `fuzz.*` tasks. The npm package
  (`gremlins.js`) has been dormant since 2020, so we vendor the built file instead of depending
  on it. Drop the minified build here and inject it via `page.addInitScript` in a `custom` step.
  Download: https://github.com/marmelab/gremlins.js (dist build), seed it for reproducibility.

- **A project webfont**, baked in for deterministic visual-regression baselines, lives in
  `../docker/fonts/` and is installed into the Playwright Docker image (`tools/docker/Dockerfile`)
  so visual baselines rasterize identically every run.

`web-vitals` is **not** vendored here — the `@mc-qa/fixtures` `vitals` fixture reads the IIFE
build directly from `node_modules/web-vitals/web-vitals.iife.js` at runtime and injects it via
`addInitScript`.

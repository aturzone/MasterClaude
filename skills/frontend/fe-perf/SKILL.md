---
name: fe-perf
description: >-
  Frontend performance where users feel it — Core Web Vitals, bundle size, render cost. Triggers on "it's slow
  / laggy / janky", "the page jumps", a poor Lighthouse or PageSpeed score, LCP/CLS/INP problems, a large
  bundle, slow lists or re-renders, or before launching anything public. Diagnoses with real numbers first,
  then fixes the thing that actually costs — not the thing that's fun to optimize.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Frontend performance — measure, then fix the biggest thing

Perceived speed is a design property. The rule that saves the most time: **measure before you optimize.**
Most "performance work" is guessing, and guessing usually lands on the 2% that wasn't the problem.

## The three that matter
| Metric | Good | What it means | Usual culprit |
|---|---|---|---|
| **LCP** | <2.5s | when the main thing appears | unoptimized hero image, render-blocking JS/CSS, slow server |
| **CLS** | <0.1 | how much the page jumps | images with no dimensions, injected banners, late fonts |
| **INP** | <200ms | interaction → visible response | long tasks on the main thread |

```bash
npx lighthouse <url> --only-categories=performance --view
npx @unlighthouse/cli --site <url>     # every route at once
```
Then read the **field** data (CrUX / RUM) if it exists. Lab numbers on your laptop lie: your machine is fast,
your network is fast, and your cache is warm. Users have none of that.

## CLS — the cheapest win in frontend
Every layout jump is reserved space you didn't reserve.
- `<img width height>` **always** (or `aspect-ratio`) — the browser needs the box before the bytes.
- Reserve space for ads, banners, embeds, and async content. Skeletons do this for free.
- `font-display: swap` **plus** a metric-matched fallback (`size-adjust`) — otherwise the swap itself is a jump.
- Never insert content above what someone is already reading.

## LCP
- Find the LCP element first (Lighthouse names it). Optimize *that* — not every image on the page.
- `<link rel="preload">` the hero image; `fetchpriority="high"`; never lazy-load it.
- **AVIF/WebP**, sized to the real slot, `srcset` for density.
- Lazy-load only **below** the fold. `loading="lazy"` on the hero is a self-inflicted LCP wound.
- Self-host fonts or `preconnect` to the CDN.

## INP / main thread
- Break long tasks. Anything >50ms blocks input.
- Virtualize long lists (`@tanstack/virtual`). The DOM is not a database.
- Memoize the expensive render, not every component — `memo()` everywhere adds cost and hides the real problem.
- Debounce search, throttle scroll, and never do layout reads inside a scroll handler.
- Heavy pure computation → a Web Worker.

## Bundle
```bash
npx vite-bundle-visualizer          # or: npx source-map-explorer 'build/static/js/*.js'
npx bundlephobia <pkg>              # check the cost BEFORE adding it
```
- Route-level code splitting first — it's the biggest win for the least work.
- Check the import cost of every new dependency. moment → date-fns/temporal; lodash → single imports.
- Tree-shake honestly (ESM, `sideEffects: false`).
- Watch for the same library bundled twice at two versions.

## Don't optimize these
Micro-optimizing a `map()` over 20 rows. Replacing a 3KB library to save 1KB. Memoizing a component that
renders twice a session. Server-rendering a page nobody's LCP depends on. **If it doesn't move LCP, CLS, INP or
bundle size, it isn't performance work — it's fidgeting.**

## Report like this
Metric → current number → target → the specific change → expected delta. "It felt faster" is not a result.

---
*Priority 3 on the `ui-intel` ladder. Pairs with `fe-motion` (the frame budget) and `fe-component-craft`
(render cost). See docs/ECOSYSTEM.md.*

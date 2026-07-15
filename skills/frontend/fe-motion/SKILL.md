---
name: fe-motion
description: >-
  Motion that means something — transitions, micro-interactions, page and list animation. Triggers on "add
  animation / transitions / make it feel smooth", "it feels janky / cheap / static", a hero or scroll effect,
  a modal/drawer/accordion/toast entrance, list reordering, or any Framer Motion / GSAP / View Transitions
  work. Covers duration, easing, what to animate, reduced-motion, and the line between polish and nausea.
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Motion — it should explain, not decorate

Good motion answers a question the user was about to ask: *where did that come from? what just changed? is it
working?* Motion that answers nothing is a tax on everyone and a migraine for some.

## The numbers
| Thing | Duration | Easing |
|---|---|---|
| Hover, focus, small state | 100–150ms | `ease-out` |
| Dropdown, tooltip, toast | 150–200ms | `ease-out` entering, `ease-in` leaving |
| Modal, drawer, sheet | 200–300ms | `cubic-bezier(.32,.72,0,1)` |
| Page / route transition | 250–350ms | `ease-in-out` |
| Anything | **never >400ms** | — |

**Enter slow-ish, exit fast.** Arriving deserves attention; leaving is just cleanup — nobody wants to watch a
modal take 300ms to go away.

## Animate these. Only these.
`transform` and `opacity` are composited on the GPU and cost ~nothing. **Everything else triggers layout or
paint on every frame.**

```css
/* good — GPU, 60fps */          /* bad — layout thrash every frame */
transform: translateY(8px);      top: 8px;
transform: scale(1.02);          width: 102%;
opacity: 0;                      height: auto;  /* the classic accordion killer */
```
Height is the common trap. Use a grid `1fr`/`0fr` transition, `max-height` with a known bound, or a measured
FLIP — not `height: auto`, which simply does not animate.

## Micro-interactions that earn their keep
- **Press feedback within 100ms.** Below that it feels instant; above it feels broken. `scale(0.98)` is enough.
- **Optimistic UI** — show the result immediately, reconcile later. Nothing feels faster.
- **Skeletons over spinners** for content with a known shape; they reserve space and prevent the CLS jump.
- **Stagger lists 20–40ms** per item. More than ~6 items and the last one arrives late enough to annoy.
- **Animate the change, not the arrival.** A number ticking to its new value teaches; a card fading in doesn't.
- **Spatial continuity** — if a panel opens from a button, it should come *from* that button.

## Reduced motion is not optional
Vestibular disorders are real; parallax and big scroll-jacking can cause genuine nausea.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
**That blanket reset is a floor, not the fix.** It only neutralizes CSS animations and transitions — a
scroll-linked parallax hero, a JS `requestAnimationFrame` tween, an autoplaying video or a Framer Motion
`useScroll` keeps moving right through it, because scroll-linked motion isn't an animation. Gate those in code:

```js
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduced) startParallax();   // and re-check on change — people toggle it mid-session
```

Reduced ≠ none. Keep opacity fades (they don't move); drop translation, parallax, and scale. Verify by actually
toggling the OS setting, not by grepping for the media query. Ship it from day one — retrofitting means
auditing every animation you wrote.

## Anti-patterns
❌ Scroll-jacking that steals the scrollbar · ❌ Animation on every element ("everything moves" = nothing
matters) · ❌ Entrance animations on content the user is waiting to read · ❌ Loading spinners under 300ms (a
flash of spinner reads as a glitch — just wait) · ❌ Infinite decorative loops near text · ❌ Animating the
thing the user is trying to click.

## Tools
Prefer **CSS transitions** — most UI needs nothing more. **View Transitions API** for route/DOM changes.
**Framer Motion** for orchestration, layout animation and gestures in React. **GSAP** only for genuinely
complex timelines. Reaching for a 40KB library to fade a tooltip is a smell.

---
*Priority 7 on the `ui-intel` ladder. Pairs with `fe-component-craft` (states) and `fe-perf` (the frame
budget). See docs/ECOSYSTEM.md.*

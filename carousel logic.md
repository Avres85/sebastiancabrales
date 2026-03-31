# Carousel Logic Summary

## Scope
This document summarizes the current carousel implementation in `index.html` + `styles.css`, with likely failure points and improvement opportunities for a follow-up LLM pass.

## Current Implementation

1. Structure
- Carousel lives in the `Collection` section.
- Container hierarchy:
  - `.carousel-shell` (viewport wrapper, `overflow: hidden`)
  - `.carousel-track` (moving flex row)
  - Multiple `.figure-item` anchors (cards)

2. Data Pattern
- There are 7 primary cards (`Figure 01` to `Figure 07`).
- The same 7 cards are duplicated immediately after the first 7.
- Duplicates are marked `aria-hidden="true"` and `tabindex="-1"`.
- Goal: seamless infinite loop effect when track translates by half its total length.

3. Motion Model
- `.carousel-track` uses CSS animation:
  - `animation: figure-loop 110s linear infinite;`
- Keyframes:
  - `0% -> transform: translateX(0)`
  - `100% -> transform: translateX(-50%)`
- Because content is duplicated 1:1, `-50%` should land exactly at the start of the second set.

4. Interaction Model
- No JS carousel controller.
- All movement is CSS-only.
- Cards are clickable anchors.
- Hover/focus adds lift/border highlight.
- Motion disables under `prefers-reduced-motion: reduce`.

## Likely Error/Fragility Areas

1. Seam sensitivity
- Infinite-loop illusion depends on exact 1:1 duplication and stable layout widths.
- Any mismatch between first set and duplicate set (different card width/content) creates a visible jump at loop reset.

2. Width coupling
- Track relies on `width: max-content` + `translateX(-50%)`.
- This assumes total track width is exactly two equal halves.
- Future edits (missing duplicate, extra card, conditional rendering) can silently break the loop.

3. Accessibility tradeoff
- Duplicates are hidden from assistive tech, which is good.
- But duplicate DOM still exists and can complicate analytics/event handling if instrumentation targets `.figure-item` generically.

4. Performance on constrained devices
- Continuous transform animation on a long flex row can be expensive with many image cards.
- `will-change: transform` helps but can still increase memory pressure.

5. No pause-on-hover/focus
- Carousel never pauses for pointer hover or keyboard focus.
- This may reduce usability when user wants to inspect/click a moving item.

## Improvement Opportunities

1. Add explicit logical grouping
- Annotate first set vs duplicate set in markup or with data attributes.
- Makes maintenance safer for future updates.

2. Add loop integrity check (build-time or runtime)
- Validate that duplicate count/content matches primary set.
- Prevents silent breakage of seamless loop.

3. Add pause controls
- Pause animation on `.carousel-shell:hover` and `.carousel-shell:focus-within`.
- Improves clickability and keyboard usability.

4. Consider JS-driven track cloning
- Keep only canonical items in source markup.
- Clone nodes at runtime for loop generation to avoid manual duplication drift.

5. Add reduced-motion fallback state
- Instead of just stopping animation, optionally expose horizontal scroll (`overflow-x: auto`) for manual navigation.

## Key Files and Selectors

- `index.html`
  - `.collection-section`
  - `.carousel-shell`
  - `.carousel-track`
  - `.figure-item`

- `styles.css`
  - `.carousel-shell`
  - `.carousel-track`
  - `@keyframes figure-loop`
  - `@media (prefers-reduced-motion: reduce)`


# Transformsite Codebase Reference

## What This Is
Sebastian's personal portfolio site. The main feature is a scroll-driven WebGL intro animation that assembles the word "SEBASTIAN" from a swarm of metallic cubes. Below the animation are three content sections: movie scenes (GIFs), figure collection (looping carousel), and technical projects (card grid).

---

## File Structure

```
transformsite/
├── index.html                  — Page shell
├── styles.css                  — All styles
├── src/
│   ├── main.js                 — Animation runtime controller (most important file)
│   ├── wordmark-trace.js       — PNG-to-contour tracing pipeline
│   └── wordmark.js             — Procedural "SEBASTIAN" geometry fallback
├── assets/fonts/
│   └── IndustrialWordmark.ttf  — Local display font (used for UI, not cube targets)
├── fontimages/
│   ├── fixedname.png           — Primary wordmark source for cube target tracing
│   ├── sebastianname.png       — Unused alternate asset
│   └── allspark.jpg            — Unused reference/experiment asset
├── main_page_graphics/
│   ├── finalrotfdropin.gif     — Movie scene 1
│   ├── finaldinobotcharge.gif  — Movie scene 2
│   ├── finaltimetofindout.gif  — Movie scene 3
│   └── carousel_images/        — 7 figure images (SCREAM PRIME, NEMESIS, SAZABI, etc.)
│       └── color-palettes.json — Swatch data for carousel cards
├── main_site/
│   ├── tech_stack.md           — Recommended future stack (Next.js + R3F + Tailwind)
│   ├── plan.txt                — Original site intent description
│   ├── style.txt               — Style notes
│   └── development_time_line.txt
├── animation-component-map.txt — Detailed file-by-file animation docs
├── carousel logic.md           — Carousel fragility analysis and improvement notes
├── merged_styles.md            — Style planning notes
├── off-white.md                — Design/color notes
└── animationmvp.txt            — Original animation spec/brief
```

---

## Runtime Architecture

### Render Modes (progressive fallback)
The body's `data-render-mode` attribute switches which layer is visible via CSS:

1. **poster** — Immediate placeholder before renderer is live (prevents blank flash)
2. **webgl** — Full Three.js instanced-cube animation (`#gl-canvas`, z-index 2)
3. **canvas** — 2D rect fallback at reduced cube count (`#fallback-canvas`, z-index 3)
4. **static** — SVG wordmark, no animation (`#static-fallback`, z-index 4)

### Scroll → Animation Mapping
- Intro section height: `260vh`
- Active scrub range: `160vh` (scroll drives animation from 0→1)
- Hold range: `20vh` (pause at end before content reveal)
- `computeRawProgress()` reads `getBoundingClientRect()` on `#intro`
- `app.progress` is the eased/smoothed value driving shaders and canvas

### Animation Phases (progress 0–1)
| Range | Phase |
|-------|-------|
| 0.00–0.20 | Void drift — cubes at base swarm positions |
| 0.20–0.45 | Signal build — directional bias toward targets |
| 0.45–0.80 | Convergence — lerp toward wordmark, overshoot |
| 0.80–1.00 | Lock + shine — metallic sweep + cyan flash |

---

## Key Source Files

### `src/main.js`
The orchestration file. Owns everything: app state, init, render loop, scroll logic, fallback switching, performance adaptation.

**Key constants:**
- `BASE_MAX_CUBES = 4400` — WebGL instance count
- `CANVAS_CUBES = 1600` — Canvas fallback count
- `CAROUSEL_PIXELS_PER_SECOND = 12.5` — Drives JS-computed carousel duration

**Quality tiers** (`low`/`medium`/`high`): all currently identical settings. Runtime can promote/demote based on FPS EMA. Chrome gets extra cubes (`CHROME_EXTRA_CUBES = 200`).

**Wordmark preparation flow:**
1. Tries to trace `fontimages/fixedname.png` via `wordmark-trace.js`
2. If trace succeeds → SVG + dense target points from mask samples
3. If trace fails → procedural SVG + targets from `wordmark.js`

**Vertex shader:** Each cube starts at `aBase` (swarm), animates toward `aTarget` (wordmark position). Applies seeded drift, swirl, overshoot, pointer influence, and per-cube spin. Scale compresses as cubes lock into place.

**Fragment shader:** Fake metallic chrome with brushed-steel variation, cyan fresnel/highlight, sweep light flash at lock.

**Performance adaptation:**
- `updateAdaptiveTier()` demotes tier if FPS < 50 for 500ms
- `updateEarlyBench()` forces static fallback if avg FPS < 30 in first 1.5s
- Mobile profile (`max-width: 900px` or `pointer: coarse`) reduces cube counts

**Carousel:** JS-computed loop width and duration (`CAROUSEL_PIXELS_PER_SECOND`). Animation is CSS-driven via `--carousel-loop-width` and `--carousel-duration` custom properties.

### `src/wordmark-trace.js`
PNG → animation targets pipeline:
1. Load PNG → draw to offscreen canvas → extract alpha mask
2. `removeSmallComponents()` — flood-fill BFS to drop noise blobs
3. `traceContours()` — walk mask edges, build polygon loops, simplify collinear points
4. `contoursToPath()` — contours → SVG path + viewBox
5. `createTargetFactory()` — returns function to sample targets at different densities/seeds
   - Four point types: `interior`, `contour`, `corner`, `baseline` — each with different jitter, scale, ratios

Exports: `traceWordmarkFromPng(imageUrl, options)` → `{ svg, contours, width, height, aspect, createTargets }`

### `src/wordmark.js`
Procedural "SEBASTIAN" generator. Each glyph is hand-defined as polygons using `bar()`, `rect()`, `strokeSegment()` helpers. Applies custom kerning table. Exports:
- `createSebastianWordmarkSvg()` — SVG path data
- `createSebastianTargets()` — Float32Array of 3D target positions
- `createBaseSwarmPositions()` — initial scattered positions
- `createSeeds()` — deterministic per-cube seeds
- `WORDMARK` — the geometry data object

### `index.html`
Three content sections below the animation:
1. **01 Scenes** — 3 GIFs in a `media-grid` (3-col → 1-col on mobile)
2. **02 Collection** — 7 figure cards in `.carousel-track`, each links to `./reviews/figure-N.html` (pages not yet built). Cards carry `--swatch-a/b/c` CSS vars for 3-color palette stripe.
3. **03 Projects** — 3 placeholder `project-card` articles in a grid (designed for easy addition)

`#content` hidden until `body.intro-complete` class added (triggered at `rawProgress >= 0.999`).

### `styles.css`
**Design tokens (CSS vars on `:root`):** void-black, midnight-metal, deep-space-navy, gunmetal, steel-slate, titanium-gray, soft-alloy, molten-orange, forge-amber, energon-blue, cold-cyan, plasma-violet, mist-white, ink.

**Key behaviors:**
- `body::before` — white overlay that fades in as intro completes (`--intro-light-progress`)
- `.sticky-shell::after` — same overlay at 0.95x opacity for inner shell
- Content section uses white/light background (stark contrast from dark intro)
- `@keyframes figure-loop` — carousel CSS animation, uses `--carousel-loop-width` set by JS
- Breakpoint at `900px`: media grid collapses to 1-col, projects collapse to 1-col, figure items narrow

---

## Content Sections Detail

### Carousel
- 7 figure items in HTML (not duplicated in markup; JS clones for seamless loop)
- Each card: image + title + 3-color palette stripe
- Cards link to `/reviews/figure-N.html` — these pages don't exist yet
- `color-palettes.json` lives in `carousel_images/` but swatch colors are currently hardcoded inline on each `<a>` element

### Projects Section
- 3 placeholder cards with "Module" tag
- Designed to be a repeatable card system
- No real project content yet — MVP placeholders

---

## Planned/Future State
Per `main_site/tech_stack.md`, the intended migration is:
- **Next.js + TypeScript + Tailwind CSS** on Vercel
- **React Three Fiber** for the hero animation only
- **Framer Motion** for non-hero motion
- **MDX** for figure review pages
- Convert GIFs to MP4/WebM

The current site is a **vanilla HTML/CSS/JS prototype** — not yet the final stack.

---

## Known Issues / Fragility Notes (from `carousel logic.md`)
- Carousel loop depends on exact half-width match — JS now handles this dynamically
- Review pages (`/reviews/figure-N.html`) are linked but don't exist
- GIFs are heavy; should be replaced with video for production
- No pause-on-hover for carousel
- `sebastianname.png` and `allspark.jpg` are unused assets
- `.DS_Store` files are committed (should be gitignored)

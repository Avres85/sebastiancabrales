# Recommended Stack For This Portfolio

## Core decision
Build the site with **Next.js + TypeScript + Tailwind CSS on Vercel**, and use **React Three Fiber** only for the landing hero animation.

Do **not** build the whole portfolio as a full-canvas Three.js experience.

That would hurt mobile performance, complicate accessibility, and make the GIF / figure / project sections harder to maintain.

## Recommended stack

### Framework
- **Next.js (App Router)**
- **React**
- **TypeScript**

Why:
- best deployment fit for Vercel
- server-rendered by default
- easy route-based structure for portfolio pages and review pages
- strong image/font optimization support
- easy split between static content and interactive components

### Styling
- **Tailwind CSS v4** for layout, spacing, colors, and responsive systems
- **CSS variables** for your dark-to-light palette and figure accent colors
- **next/font/local** for self-hosted display and body fonts

Why:
- fast to iterate
- easy to keep a consistent design system
- avoids shipping a lot of custom CSS too early
- local fonts help performance and prevent layout shift

### 3D / hero animation
- **three**
- **@react-three/fiber**
- **@react-three/drei**

Why:
- React Three Fiber is the right layer if you want a Three.js-powered hero inside a React/Next app
- drei reduces boilerplate for cameras, controls, environment helpers, and loaders
- keeps the WebGL code isolated to one section instead of making the whole app depend on a canvas architecture

### Motion outside the hero
- **Framer Motion** for text reveals, fades, section transitions, and subtle hover states

Why:
- better fit than WebGL for the rest of the page
- easier to keep motion restrained
- more reliable on mobile than trying to animate everything in Three.js

### Content model
For MVP:
- `/data/projects.ts`
- `/data/figures.ts`
- `/content/reviews/*.mdx`

Why:
- projects and figure metadata stay easy to edit
- long-form figure review pages are better in MDX than hardcoded JSX
- avoids adding a CMS before you need one

### Media strategy
- **next/image** for still images
- **MP4/WebM instead of GIFs wherever possible**
- optional lightweight video component for autoplay-muted preview loops

Why:
- real GIFs are usually too heavy for mobile
- video delivers the same visual effect at much lower cost

### Deployment / platform
- **Vercel**
- GitHub integration for preview deploys
- optional **Vercel Analytics** after MVP is stable

## Architecture recommendation

### Routes
- `/` homepage
- `/reviews/[slug]` figure review pages
- optional `/projects/[slug]` later if you want full case studies

### App structure
- `app/layout.tsx`
- `app/page.tsx`
- `app/reviews/[slug]/page.tsx`
- `components/hero/*`
- `components/sections/*`
- `components/ui/*`
- `data/*`
- `content/reviews/*`
- `public/images/*`
- `public/video/*`

### Rendering strategy
Use **Server Components by default**.
Only mark components as client components when they truly need:
- WebGL
- hover-heavy interaction
- carousel logic
- scroll-triggered motion

This keeps the JS bundle smaller for mobile.

## Mobile-first performance rules

### Rule 1
Use Three.js only in the hero.
Everything below the fold should be normal DOM content unless there is a strong reason not to.

### Rule 2
Ship a lighter hero on phones.
Recommended mobile behavior:
- reduce geometry complexity
- reduce pixel ratio
- remove expensive postprocessing
- shorten animation duration
- swap to a poster or simplified scene on weaker devices

### Rule 3
Use on-demand rendering where possible.
If the hero is not constantly moving, do not run a full 60fps render loop forever.

### Rule 4
Avoid GIF files.
Convert movie clips to compressed MP4/WebM loops.
Use poster images until visible.

### Rule 5
Lazy-load everything below the hero.
That includes:
- movie clips
- figure collection images
- review thumbnails
- project media

### Rule 6
Do not let multiple heavy animations run together.
You already have:
- hero motion
- movie media row
- looping figure strip

Only one section should feel dominant at a time.

### Rule 7
Respect reduced motion.
If `prefers-reduced-motion` is enabled:
- disable or simplify the WebGL hero
- stop autoplay loops
- remove continuous marquee motion

## Specific recommendation for your site

### Best stack
Use:
- **Next.js**
- **TypeScript**
- **Tailwind CSS**
- **React Three Fiber + drei** for the hero only
- **Framer Motion** for the rest of the motion system
- **MDX + TypeScript data files** for content
- **Vercel** for deploys

### What not to do
Do not use:
- a full-screen WebGL-only portfolio shell
- GIF-heavy media sections
- a CMS at the start
- heavy postprocessing as a default mobile experience
- client-side rendering for the whole site

## Implementation phases

### Phase 1
Scaffold the app and design system:
- Next.js app
- Tailwind setup
- font setup
- color tokens
- section shells

### Phase 2
Build content structure:
- hero shell
- movie/media row
- figure carousel shell
- project grid shell
- review page route

### Phase 3
Add interaction carefully:
- hero WebGL scene
- figure carousel motion
- hover states
- section transitions

### Phase 4
Mobile optimization and deployment:
- image/video compression
- reduced motion support
- lazy loading
- Lighthouse pass
- Vercel deploy

## Bottom line
The best stack is **Next.js on Vercel with React Three Fiber used surgically, not globally**.

That gives you:
- the cinematic hero you want
- maintainable portfolio sections
- better mobile performance
- simpler deployment
- room to grow without rewriting the site later

# Porkchop Mission Planner

An interactive interplanetary trajectory design tool. Explore Lambert-solver porkchop plots, plan multi-body Grand Tours with patched-conic gravity assists, and visualize transfers in an animated 3D solar system.

**Live app:** https://porkchop-mission-planner.vercel.app

## Features

- **Porkchop plots** — Δv contour maps across launch/arrival date windows for any planet pair, with retrograde and multi-revolution Lambert solver toggles and a top-5 transfer table.
- **3D solar system view** — animated transfer arcs, orbit-capped planet/sun sizing, click-to-lock transfer windows, live launch countdown.
- **Grand Tour planner** — coordinate-descent optimizer for multi-flyby trajectories (patched-conic method), validated against Voyager 2's real flyby dates and C3; synodic time-lapse mode.
- **Mission tools** — rocket payload mapper, aerocapture and capture-burn modeling, historical mission overlay, difficulty scoring, CSV export, shareable permalinks, and PDF mission/tour reports.
- **UI** — metric/imperial and color-palette toggles, GL error boundary with safe-canvas fallback for constrained GPUs.

## Tech stack

React 19 + TypeScript, Vite, Tailwind CSS, Three.js / React Three Fiber (+ drei, postprocessing), [astronomy-engine](https://github.com/cosinekitty/astronomy) for ephemerides, d3 (contour/geo/scale) for porkchop plot rendering, jsPDF for report export.

## Getting started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Validation

Physics correctness is checked with sanity-check scripts before any change to trajectory/orbit code should be considered safe to ship:

```bash
npm run validate          # Vallado 7-5, Perseverance C3, Earth->Mars 2026 window, synodic period checks
npx tsx scripts/smoke-phase2.ts
npx tsx scripts/smoke-phase3.ts
npx tsx scripts/smoke-tour.ts   # Voyager 2 real-date flyby validation
```

## Deployment

Deployed on Vercel, auto-deploying from the `main` branch of this repository.

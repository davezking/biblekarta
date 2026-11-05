# Chart performance (P2-S3-T7)

`pnpm perf` checks the chart against the budgets in architecture §1 and §9. It's separate from `pnpm e2e`, so the PR suite stays fast. CI runs it in the `e2e` workflow on pushes to `phase-*` only, and uploads its report as `perf-report`.

| Budget | Target |
|---|---|
| Frames during zoom and pan, stress seed, 4× CPU | p95 ≤ 20 ms (desktop and Pixel 7) |
| Initial JS | ≤ 250 KB gz |
| Chart island | ≤ 180 KB gz |
| LCP, seeded preview build, Fast 3G | ≤ 3 s |

## Method

- **Builds** (`build.ts`, once per run from `global-setup.ts`):
  - `seeded/` is a preview-style build (`BK_SEED=1`), as Cloudflare ships for a branch.
  - `stress/` is the same build with its chart data (`/data/index.json` and the tiles) recompiled from the stress seed.
  - Both go to `node_modules/.cache/bk-perf/`. `PERF_REUSE=1` keeps them between runs, for local iteration.
  - A small static server (`server.ts`) serves each with gzip, as Pages does.
- **Stress seed** (`scripts/stress-seed.mjs`):
  - About 10× Board 5's density in one era: 40 streams, 600 reigns, 300 events and 60 prophets, with some forked polities. It compiles to 30 lanes, 5.3k px tall, and a 52 KB gz tile.
  - Every name is "Stress …", every entry has `fixture: true`, and it's deterministic (a seeded PRNG).
  - It's written to a temp dir at test time and deleted after compiling. The script refuses to write into `seed/` or `content/`.
  - A spec checks that no stress data appears in `seed/`, `content/` or the seeded build.
- **Frames** (`chart-perf.spec.ts`):
  - The stress site loads at its default (whole-era) view, then CDP `Emulation.setCPUThrottlingRate` is set to 4.
  - The scripted sequence:
    - desktop: 20 wheel-zoom steps in, an 80-step mouse drag (600 px left and back), and 20 wheel steps out;
    - Pixel 7: Chromium's synthetic touch gestures, i.e. a pinch out ×3, a one-finger pan 300 px left and back, and a pinch in ×0.4.
  - Frame times are `requestAnimationFrame` deltas over the whole sequence. The report gives p50, p95, p99 and max, and the deltas are attached as `frames.json`.
  - `PERF_CPU=<n>` changes the throttle, to see how the numbers scale.
- **JS**:
  - Gzip sizes come from the seeded build's output.
  - Initial JS is the static-import closure of everything `index.html` loads at once (scripts, module preloads, `client:load` islands with their renderer), plus inline scripts.
  - The chart island is the closure of the Chart island's component and renderer, React included.
- **LCP**:
  - A `largest-contentful-paint` observer on the seeded site, with the cache disabled, under DevTools' Fast 3G preset (562.5 ms RTT, 1.44 Mbps down).
  - Pixel 7 also gets 4× CPU.

## Numbers

All runs were in the Claude Code cloud container (headless Chromium, Playwright 1.64). Frame numbers vary by ±15–20 ms between runs at 4×. The Pixel 7 run records only about 80 frames, so its p95 is noisier.

| | Before | After |
|---|---|---|
| Desktop p95 / p99 / max, 4× (ms) | 400 / 717 / 1033 | 83–100 / 150–200 / 317–483 |
| Pixel 7 p95 / p99 / max, 4× (ms) | 317 / 467 / 467 | 183–200 / 233–350 / 233–350 |
| Desktop p95, 2× / 1× (ms) | — | 33 / 16.7 |
| Pixel 7 p95, 2× / 1× (ms) | — | 33 / 16.8 |
| Desktop run time for the sequence | 37.6 s | 15.9 s |
| Initial JS (KB gz) | 111.1 | 112.8 |
| Chart island (KB gz) | 109.1 | 110.9 |
| LCP desktop / Pixel 7 (s) | 1.33 / 1.40 | 1.34 / 1.39 |
| Board 5 seed, desktop p95 at 4× (ms) | — | 17 |

Desktop p95 by phase after the fixes, at 4×:
- pan: 50 ms (it was 133 before the movement-based commits);
- wheel zoom: 83–100 ms.

**Verdict for Phase 2:**
- JS and LCP are well within budget.
- Frames meet budget on the Board 5 seed at 4× (p95 17 ms), and on the stress seed at 1×. They miss on the stress seed at 4×.
- With the labels static, a geometry-only transform frame of the stress chart still costs about 36 ms of style, layout and paint at 4×. So SVG streams can't reach a 20 ms p95 at this density on this CPU, whatever the screen-space layers do.

That is PRD risk #9. The decision (Canvas for the stream layer) belongs to P5-S2-T1, with dense real data. Until then the CI perf step reports but doesn't block.

## What the profile showed, and the fixes

At 4× each wheel step took a 200–280 ms frame: about 80 ms layout, 90 ms paint and 70 ms layerize, plus about 130 ms more whenever a commit landed.

1. **Forced layouts on every commit.**
   - AxisLayer measured each tick label with `getComputedTextLength()`, about 1.3 s across the sequence. It now uses canvas `measureText`, cached per text.
   - AxisLayer also read `document.fonts.ready` on every commit (600 ms). It's now read once per page.
   - `zoom.ts` read `getBoundingClientRect()` on every wheel event. It's now read once per wheel sequence.
2. **Commits mid-gesture.** A long gesture (over 1 s) committed every 150 ms, i.e. a full React render about 33 times in a 5 s drag. It now commits only once the view has moved far from the last commit (half a screen, or 1.25× zoom), the point where the layers need nodes they didn't render.
3. **Nodes outside the viewport** (one of the task's named suspects).
   - The chart is 5.3k px tall with 30 lanes, and Chrome paints an SVG's whole subtree on any change, out to about 4000 px beyond the viewport.
   - The viewport channel now carries the y band near the window, which Chart updates on scroll. Geometry outside it gets `display: none` (`cull.ts`; lanes, reign streams, hit groups, bars and pills).
   - Screen-space layers (reign labels, events, people, figures):
     - cull per frame to the screen ± 160 px, and to the band;
     - render only what's near the committed view, a screen either side.
4. **Work per frame.**
   - Placement writes go through a writer that skips unchanged values (`dom-writer.ts`).
   - Reign labels, items and figures move by a `transform` on their group, so the text isn't re-laid out.
   - On pan frames the whole group shifts by one transform (`panShifting`), and only nodes at a screen edge are re-placed.
5. **Fewer property nodes.**
   - ReignLayer clips each stream's group once, instead of each of 600 segments.
   - ReignLayer and FigureLayer skip re-rendering when only the committed viewport changed (`memo.ts`).

Figures already used the sprite (`<use>`), so they needed no change.

## Ideas not taken

These were measured and dropped:
- **`will-change: transform` on the SVG groups:** layerize grew from 20 to about 220 ms per frame.
- **Half a screen of y margin instead of a full one:** no measurable change, and scrolling is safer with more.

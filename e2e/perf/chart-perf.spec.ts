// The chart performance budgets (P2-S3-T7; architecture §1 and §9). Run with `pnpm perf`.
//
// - Frames: on the stress build, at 4× CPU throttle, a scripted zoom / pan / pinch sequence is
//   recorded as requestAnimationFrame deltas; p95 must be ≤ 20 ms (desktop and Pixel 7).
// - JS: initial JS ≤ 250 KB gz, and the chart island ≤ 180 KB gz, from the seeded build's output.
// - LCP: ≤ 3 s on the seeded build under DevTools' Fast 3G (and 4× CPU on the phone).
// The method and the recorded numbers are in ./README.md.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { SEEDED_DIR } from './build';
import { SEEDED_PORT, STRESS_PORT } from './global-setup';

export const BUDGET = {
  p95FrameMs: 20,
  initialJsKb: 250,
  chartIslandKb: 180,
  lcpMs: 3000,
  /** CPU slowdown for the frame and phone LCP runs; PERF_CPU overrides it to explore (README). */
  cpuThrottle: Number(process.env.PERF_CPU ?? 4),
};

/** DevTools' "Fast 3G" preset. */
const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1.44 * 1024 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
};

const stress = (path = '/') => `http://127.0.0.1:${STRESS_PORT}${path}`;
const seeded = (path = '/') => `http://127.0.0.1:${SEEDED_PORT}${path}`;

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

async function chartReady(page: Page) {
  await page.waitForSelector('svg.chart-svg g.chart-geometry [data-reign-segment]', {
    state: 'attached',
  });
  // Fonts and the first LOD commit settle.
  await page.waitForTimeout(1000);
}

async function startFrames(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __bkFrames: number[]; __bkRec: boolean };
    w.__bkFrames = [];
    w.__bkRec = true;
    let last: number | undefined;
    const tick = (t: number) => {
      if (last !== undefined) w.__bkFrames.push(t - last);
      last = t;
      if (w.__bkRec) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrames(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __bkFrames: number[]; __bkRec: boolean };
    w.__bkRec = false;
    return w.__bkFrames;
  });
}

const frame = (page: Page) => page.waitForTimeout(16);

/** Desktop: wheel-zoom in, drag-pan, wheel-zoom out (at the chart's centre). */
async function desktopGestures(page: Page) {
  const box = (await page.locator('svg.chart-svg').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = Math.min(box.y + 300, box.y + box.height / 2);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -80);
    await frame(page);
  }
  await page.mouse.down();
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(cx - i * 15, cy, { steps: 1 });
    await frame(page);
  }
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(cx - 600 + i * 15, cy, { steps: 1 });
    await frame(page);
  }
  await page.mouse.up();
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 80);
    await frame(page);
  }
}

/** Phone: pinch out, pan with one finger, pinch in (Chromium's synthetic touch gestures). */
async function mobileGestures(page: Page, cdp: CDPSession) {
  const box = (await page.locator('svg.chart-svg').boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(Math.max(box.y + 120, Math.min(box.y + 300, 500)));
  const touch = { gestureSourceType: 'touch' as const };
  await cdp.send('Input.synthesizePinchGesture', {
    x,
    y,
    scaleFactor: 3,
    relativeSpeed: 600,
    ...touch,
  });
  await cdp.send('Input.synthesizeScrollGesture', {
    x,
    y,
    xDistance: -300,
    yDistance: 0,
    speed: 600,
    preventFling: true,
    ...touch,
  });
  await cdp.send('Input.synthesizeScrollGesture', {
    x,
    y,
    xDistance: 300,
    yDistance: 0,
    speed: 600,
    preventFling: true,
    ...touch,
  });
  await cdp.send('Input.synthesizePinchGesture', {
    x,
    y,
    scaleFactor: 0.4,
    relativeSpeed: 600,
    ...touch,
  });
}

test.describe(`chart frames, stress seed, ${BUDGET.cpuThrottle}× CPU`, () => {
  test('p95 frame time during zoom and pan is within budget', async ({ page, isMobile }, info) => {
    await page.goto(stress('/'));
    await chartReady(page);
    const nodes = await page.evaluate(() => document.querySelectorAll('svg.chart-svg *').length);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: BUDGET.cpuThrottle });
    try {
      await startFrames(page);
      if (isMobile) await mobileGestures(page, cdp);
      else await desktopGestures(page);
      const frames = await stopFrames(page);
      const p95 = percentile(frames, 95);
      const report = {
        project: info.project.name,
        frames: frames.length,
        p50: +percentile(frames, 50).toFixed(1),
        p95: +p95.toFixed(1),
        p99: +percentile(frames, 99).toFixed(1),
        max: +Math.max(...frames).toFixed(1),
        svgNodes: nodes,
      };
      console.log(`perf frames ${JSON.stringify(report)}`);
      await info.attach('frames.json', {
        body: JSON.stringify({ ...report, deltas: frames }),
        contentType: 'application/json',
      });
      expect(frames.length, 'enough frames recorded').toBeGreaterThan(30);
      expect(p95, `p95 frame ${p95.toFixed(1)} ms`).toBeLessThanOrEqual(BUDGET.p95FrameMs);
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });
});

// --- JS budgets ------------------------------------------------------------------------------

const STATIC_IMPORT =
  /(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g;

/** A module and everything it imports statically (dynamic import() is lazy, so left out). */
async function closure(dir: string, entries: readonly string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const url = queue.pop()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const src = await readFile(join(dir, url), 'utf8');
    for (const m of src.matchAll(STATIC_IMPORT)) {
      queue.push(new URL(m[1]!, `http://x${url}`).pathname);
    }
  }
  return seen;
}

const gzKb = async (dir: string, files: Iterable<string>) => {
  let bytes = 0;
  for (const f of files) bytes += gzipSync(await readFile(join(dir, f))).length;
  return bytes / 1024;
};

export async function jsBudgets(dir: string) {
  const html = await readFile(join(dir, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]!);
  const preloads = [...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map(
    (m) => m[1]!,
  );
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]!)
    .join('\n');
  // Islands that hydrate on load are part of the initial JS; client:idle / visible ones are not.
  const islands = [...html.matchAll(/<astro-island\b[^>]*>/g)].map((m) => m[0]);
  const eager = islands.filter((tag) => /client="load"/.test(tag));
  const urls = (tags: string[], a: string) =>
    tags.flatMap((tag) => [...tag.matchAll(new RegExp(`${a}="([^"]+)"`, 'g'))].map((m) => m[1]!));
  const initialEntries = [
    ...scripts,
    ...preloads,
    ...urls(eager, 'component-url'),
    ...urls(eager, 'renderer-url'),
  ];
  const chart = islands.find((tag) => /component-url="[^"]*\/Chart\.[^"]*\.js"/.test(tag));
  if (!chart) throw new Error('no Chart island in index.html');
  const islandEntries = [...urls([chart], 'component-url'), ...urls([chart], 'renderer-url')];
  const initialFiles = await closure(dir, initialEntries);
  const islandFiles = await closure(dir, islandEntries);
  return {
    initialKb: (await gzKb(dir, initialFiles)) + gzipSync(inline).length / 1024,
    chartIslandKb: await gzKb(dir, islandFiles),
    initialFiles: [...initialFiles].sort(),
    islandFiles: [...islandFiles].sort(),
  };
}

test('initial JS and the chart island are within their gzip budgets', async ({
  isMobile,
}, info) => {
  test.skip(isMobile, 'the build output is the same for both projects');
  const r = await jsBudgets(SEEDED_DIR);
  console.log(
    `perf js ${JSON.stringify({ initialKb: +r.initialKb.toFixed(1), chartIslandKb: +r.chartIslandKb.toFixed(1), initial: r.initialFiles, island: r.islandFiles })}`,
  );
  await info.attach('js.json', { body: JSON.stringify(r), contentType: 'application/json' });
  expect(r.initialKb).toBeLessThanOrEqual(BUDGET.initialJsKb);
  expect(r.chartIslandKb).toBeLessThanOrEqual(BUDGET.chartIslandKb);
});

// --- LCP -------------------------------------------------------------------------------------

test('LCP on the seeded preview build is within budget under Fast 3G', async ({
  page,
  isMobile,
}, info) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', FAST_3G);
  if (isMobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: BUDGET.cpuThrottle });
  await page.addInitScript(() => {
    const w = window as unknown as { __bkLcp: number };
    w.__bkLcp = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__bkLcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(seeded('/'), { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(500);
  const lcp = await page.evaluate(() => (window as unknown as { __bkLcp: number }).__bkLcp);
  console.log(`perf lcp ${JSON.stringify({ project: info.project.name, lcpMs: Math.round(lcp) })}`);
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThanOrEqual(BUDGET.lcpMs);
});

// --- Stress data stays in the perf builds -------------------------------------------------------

test('no stress data in seed/, content/ or the seeded build', async ({ isMobile }) => {
  test.skip(isMobile, 'one check is enough');
  const { readdir } = await import('node:fs/promises');
  const files = async (dir: string): Promise<string[]> =>
    (await readdir(dir, { withFileTypes: true, recursive: true }))
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name));
  for (const dir of ['seed', 'content', join(SEEDED_DIR, 'data')]) {
    for (const f of await files(dir)) {
      expect(f, `${f} is a stress file`).not.toMatch(/stress/i);
      if (f.endsWith('.json')) {
        expect(await readFile(f, 'utf8'), `${f} holds stress data`).not.toMatch(
          /"stress-|Stress \d/,
        );
      }
    }
  }
});

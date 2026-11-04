// @vitest-environment happy-dom
import { act, createElement, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexEra, IndexFile, TileFile } from '../../../lib/core/datafiles';
import { x as yearToX } from '../../../lib/layout/timescale';
import Chart from '../Chart';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore, type Viewport } from '../state';
import { WHEEL_END_MS } from '../zoom';
import { useChartData, type ChartDataState } from './useChartData';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Three live eras cut from the seed's one (astronomical −1009…−789 → a, b, c). Each tile holds
 * the seed items whose span touches its era, so items crossing a boundary are in two tiles,
 * and every stream band is in all three (as the compiler does for a stream spanning eras).
 */
const CUTS: [string, number, number][] = [
  ['a', -1009, -940],
  ['b', -939, -870],
  ['c', -869, -789],
];
let index: IndexFile;
let tiles: Record<string, TileFile>;

beforeAll(async () => {
  const seed = await seedChartData();
  const cfg = seed.index.timescale!;
  const eras: IndexEra[] = CUTS.map(([slug, s, e], i) => ({
    ...seed.index.eras[0]!,
    id: slug,
    slug,
    order: i + 1,
    start: { scholarly: s },
    end: { scholarly: e },
    x: {
      scholarly: { x0: yearToX(s, 'scholarly', cfg), x1: yearToX(e + 1, 'scholarly', cfg) },
      traditional: null,
    },
    tile: `tiles/${slug}.json`,
  }));
  index = { ...seed.index, eras };
  tiles = {};
  for (const era of eras) {
    const { x0, x1 } = era.x.scholarly!;
    const touches = (g: { x0: number; x1: number }) => g.x1 >= x0 && g.x0 <= x1;
    const geo = seed.tile.axes.scholarly;
    const reigns = geo.reigns.filter(touches);
    const rIds = new Set(reigns.map((r) => r.reign_id));
    tiles[era.slug] = {
      ...seed.tile,
      era: era.slug,
      axes: {
        ...seed.tile.axes,
        scholarly: {
          ...geo,
          reigns,
          events: geo.events.filter(touches),
          people: geo.people.filter(touches),
        },
      },
      reigns: seed.tile.reigns.filter((r) => rIds.has(r.id)),
    };
  }
});

interface Call {
  url: string;
  signal: AbortSignal;
  resolve: () => void;
  fail: () => void;
}
let calls: Call[];
/** When true, tile responses wait for the test to resolve them. */
let hold: boolean;

beforeEach(() => {
  calls = [];
  hold = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((res, rej) => {
          init.signal.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          );
          const body = url.endsWith('index.json')
            ? index
            : tiles[/tiles\/(\w+)\.json$/.exec(url)![1]!];
          const call: Call = {
            url,
            signal: init.signal,
            resolve: () => res(new Response(JSON.stringify(body), { status: 200 })),
            fail: () => res(new Response('', { status: 500 })),
          };
          calls.push(call);
          if (!hold || url.endsWith('index.json')) call.resolve();
        }),
    ),
  );
});

let container: HTMLElement;
let root: Root;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const urls = () => calls.map((c) => c.url.replace('/data/', ''));
const tileUrls = () => urls().filter((u) => u.startsWith('tiles/'));
const flush = () => act(async () => {});

/** The viewport (width 1000) that shows era `slug` exactly. */
function viewOf(slug: string): Viewport {
  const { x0, x1 } = index.eras.find((e) => e.slug === slug)!.x.scholarly!;
  const k = 1000 / (x1 - x0);
  return { x: -x0 * k, k, width: 1000 };
}

async function mountHook(store: ChartStore) {
  const out: { state: ChartDataState } = { state: { status: 'loading' } };
  function Probe() {
    out.state = useChartData('/data/', undefined, store);
    return null;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Probe)));
  await flush();
  return out;
}

const ready = (s: ChartDataState) => {
  if (s.status !== 'ready') throw new Error(`not ready: ${s.status}`);
  return s;
};

describe('useChartData', () => {
  it('loads the eras in view plus one either side, each once', async () => {
    const store = createChartStore();
    store.commitViewport(viewOf('a'));
    const out = await mountHook(store);
    expect(urls()).toEqual(['index.json', 'tiles/a.json', 'tiles/b.json']);
    expect(ready(out.state).tile.era).toBe('a+b');

    // Panning to b brings c into the window before it is on screen; a and b are not refetched.
    await act(async () => store.commitViewport(viewOf('b')));
    await flush();
    expect(tileUrls()).toEqual(['tiles/a.json', 'tiles/b.json', 'tiles/c.json']);
    expect(ready(out.state).tile.era).toBe('a+b+c');

    // And back: nothing is fetched again.
    await act(async () => store.commitViewport(viewOf('a')));
    await flush();
    expect(tileUrls()).toHaveLength(3);
  });

  it('aborts the request for an era that leaves the window before it arrives', async () => {
    hold = true;
    const store = createChartStore();
    store.commitViewport(viewOf('a'));
    const out = await mountHook(store);
    const b = calls.find((c) => c.url.endsWith('b.json'))!;
    calls.find((c) => c.url.endsWith('a.json'))!.resolve();
    await flush();
    expect(out.state.status).toBe('ready');

    // At c the window is b, c: b (still in flight) is kept, and c is requested.
    await act(async () => store.commitViewport(viewOf('c')));
    expect(b.signal.aborted).toBe(false);
    const c = calls.find((x) => x.url.endsWith('c.json'))!;
    // Back at a (window a, b) before c arrives: c's request is aborted, b's kept.
    await act(async () => store.commitViewport(viewOf('a')));
    expect(c.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
  });

  it('merges tiles without duplicating an item', async () => {
    const store = createChartStore();
    store.commitViewport(viewOf('b'));
    const out = await mountHook(store);
    const view = ready(out.state).tile;
    const geo = view.axes.scholarly;
    const unique = (xs: string[]) => expect(new Set(xs).size).toBe(xs.length);
    unique(geo.bands.map((b) => b.stream_id));
    unique(geo.reigns.map((r) => r.reign_id));
    unique(view.reigns.map((r) => r.id));
    unique(view.people.map((p) => p.id));
    // Bands are in all three tiles: each appears once.
    expect(geo.bands.length).toBe(tiles.a!.axes.scholarly.bands.length);
    // A reign crossing the a/b boundary (Rehoboam, Jeroboam's era) is in two tiles: once here.
    const both = tiles.a!.axes.scholarly.reigns.filter((r) =>
      tiles.b!.axes.scholarly.reigns.some((s) => s.reign_id === r.reign_id),
    );
    expect(both.length).toBeGreaterThan(0);
  });

  it('gives the layers only the items within one screen of the viewport', async () => {
    const store = createChartStore();
    // The first half of era a: one screen is a sixth of the chart, so tile b reaches past it.
    const a = viewOf('a');
    const v = { ...a, k: a.k * 2, x: a.x * 2 };
    store.commitViewport(v);
    const out = await mountHook(store);
    const [x0, x1] = [-v.x / v.k, (v.width - v.x) / v.k];
    const margin = v.width / v.k;
    const geo = ready(out.state).tile.axes.scholarly;
    expect(geo.reigns.length).toBeGreaterThan(0);
    for (const r of geo.reigns) {
      expect(r.x1).toBeGreaterThanOrEqual(x0 - margin);
      expect(r.x0).toBeLessThanOrEqual(x1 + margin);
    }
    // Something loaded (in tile b) lies beyond the margin and was culled.
    const loaded = [...tiles.a!.axes.scholarly.reigns, ...tiles.b!.axes.scholarly.reigns];
    expect(loaded.some((r) => r.x0 > x1 + margin)).toBe(true);
  });

  it('shows the frame with nothing drawn when a tile fails, and logs it', async () => {
    hold = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createChartStore();
    store.commitViewport(viewOf('a'));
    const out = await mountHook(store);
    for (const c of calls.filter((x) => x.url.includes('tiles/'))) c.fail();
    await flush();
    const view = ready(out.state).tile;
    expect(view.axes.scholarly.bands).toEqual([]);
    expect(log).toHaveBeenCalled();
  });

  it('reports an error when the index cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const out = await mountHook(createChartStore());
    expect(out.state.status).toBe('error');
  });
});

describe('Chart with the windowed loader', () => {
  it('fetches each tile once and commits nothing during a gesture', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'Date'] });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
      value: undefined,
      configurable: true,
    });
    for (const key of ['clientLeft', 'clientTop']) {
      Object.defineProperty(SVGSVGElement.prototype, key, { value: 0, configurable: true });
    }
    const commits = { count: 0 };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(
          Profiler,
          { id: 'chart', onRender: () => void commits.count++ },
          createElement(Chart, { store: createChartStore() }),
        ),
      ),
    );
    for (let i = 0; i < 5; i++) await flush();
    const svg = container.querySelector('svg.chart-svg') as SVGSVGElement;
    expect(svg).not.toBeNull();
    // The fit view shows all three eras.
    expect(tileUrls().sort()).toEqual(['tiles/a.json', 'tiles/b.json', 'tiles/c.json']);

    const before = commits.count;
    for (let i = 0; i < 10; i++) {
      act(() => {
        const e = new WheelEvent('wheel', { bubbles: true, cancelable: true });
        for (const [k, v] of Object.entries({
          deltaY: -40,
          deltaX: 0,
          deltaMode: 0,
          clientX: 300,
          clientY: 0,
          shiftKey: false,
          ctrlKey: false,
        })) {
          Object.defineProperty(e, k, { value: v });
        }
        svg.dispatchEvent(e);
        vi.advanceTimersByTime(10);
      });
    }
    expect(commits.count).toBe(before);
    await act(async () => void vi.advanceTimersByTime(WHEEL_END_MS));
    for (let i = 0; i < 3; i++) await flush();
    expect(commits.count).toBeGreaterThan(before);
    // Zoomed in, the window narrowed; nothing already loaded was fetched again.
    expect(tileUrls()).toHaveLength(3);
    vi.useRealTimers();
  });
});

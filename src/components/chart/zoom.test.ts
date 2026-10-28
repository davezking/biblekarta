// @vitest-environment happy-dom
import { createElement, Profiler, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { totalWidth } from '../../lib/layout/timescale';
import Chart from './Chart';
import type { ChartData } from './data/useChartData';
import { seedChartData } from './seed-data.testutil';
import { createChartStore, type ChartStore } from './state';
import { WHEEL_END_MS, type ChartController } from './zoom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WIDTH = 1000;
let data: ChartData;
let container: HTMLElement;
let root: Root;

beforeAll(async () => {
  data = await seedChartData();
});

beforeEach(() => {
  vi.useFakeTimers();
  // happy-dom's SVG points can't matrixTransform; without createSVGPoint, d3 falls back to
  // getBoundingClientRect, as it does for HTML elements.
  Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
    value: undefined,
    configurable: true,
  });
  // …which subtracts clientLeft/clientTop, which happy-dom leaves undefined on SVG elements.
  for (const key of ['clientLeft', 'clientTop']) {
    Object.defineProperty(SVGSVGElement.prototype, key, { value: 0, configurable: true });
  }
  // happy-dom does no layout: give the chart a width.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Mounted {
  svg: SVGSVGElement;
  geometry: SVGGElement;
  overlay: SVGGElement;
  store: ChartStore;
  controller: ChartController;
  commits: { count: number };
}

async function mount(): Promise<Mounted> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const store = createChartStore();
  const commits = { count: 0 };
  let controller: ChartController | undefined;
  await act(async () =>
    root.render(
      createElement(
        Profiler,
        { id: 'chart', onRender: () => void commits.count++ },
        createElement(Chart, { data, store, onController: (c) => (controller = c) }),
      ),
    ),
  );
  const svg = container.querySelector('svg.chart-svg') as SVGSVGElement;
  return {
    svg,
    geometry: svg.querySelector('g.chart-geometry') as SVGGElement,
    overlay: svg.querySelector('g.chart-overlay') as SVGGElement,
    store,
    controller: controller!,
    commits,
  };
}

const parse = (attr: string | null) => {
  const m = /^translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+),([-\d.e]+)\)$/.exec(attr ?? '');
  if (!m) throw new Error(`unexpected transform ${attr}`);
  return { x: +m[1]!, y: +m[2]!, kx: +m[3]!, ky: +m[4]! };
};

/**
 * A wheel event as a browser sends it. happy-dom's WheelEvent keeps only the deltas, dropping the
 * MouseEvent fields (clientX/Y, modifier keys) that browsers always set, so they are defined here.
 */
function wheel(svg: SVGSVGElement, init: WheelEventInit) {
  const all = {
    clientX: 500,
    clientY: 0,
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    shiftKey: false,
    ctrlKey: false,
    ...init,
  };
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...all });
  for (const [key, value] of Object.entries(all)) {
    Object.defineProperty(e, key, { value, configurable: true });
  }
  return svg.dispatchEvent(e);
}

describe('zoom', () => {
  it('commits zero times during a 30-event wheel sequence, and once at its end', async () => {
    const m = await mount();
    const before = m.commits.count;
    const committed = m.store.getSnapshot().committedViewport;
    for (let i = 0; i < 30; i++) {
      act(() => {
        wheel(m.svg, { deltaY: -40 });
        vi.advanceTimersByTime(10);
      });
    }
    expect(m.commits.count).toBe(before);
    expect(m.store.getSnapshot().committedViewport).toBe(committed);
    // The DOM moved anyway: the geometry group is scaled.
    expect(parse(m.geometry.getAttribute('transform')).kx).toBeGreaterThan(committed!.k);

    act(() => void vi.advanceTimersByTime(WHEEL_END_MS));
    expect(m.commits.count).toBe(before + 1);
    expect(m.store.getSnapshot().committedViewport!.k).toBeCloseTo(m.controller.getView().k);
  });

  it('keeps y at 0 and scales x only, on the geometry and overlay groups', async () => {
    const m = await mount();
    act(() => {
      wheel(m.svg, { deltaY: -200, clientY: 300 });
      wheel(m.svg, { deltaY: 30, shiftKey: true });
      wheel(m.svg, { deltaX: 50, deltaY: 5 });
      vi.advanceTimersByTime(WHEEL_END_MS);
    });
    // A mouse drag that moves diagonally only pans x.
    m.controller.setView({ x: -400, k: 3 });
    const beforeDrag = m.controller.getView();
    act(() => {
      m.svg.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 400, clientY: 100, view: window }),
      );
      window.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 260, view: window }),
      );
      window.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 260, view: window }),
      );
    });
    expect(m.controller.getView()).toEqual({ x: beforeDrag.x - 100, k: beforeDrag.k });
    for (const g of [m.geometry, m.overlay]) {
      const t = parse(g.getAttribute('transform'));
      expect(t.y).toBe(0);
      expect(t.ky).toBe(1);
    }
    m.controller.setView({ x: -50, k: 3 });
    expect(parse(m.geometry.getAttribute('transform')).y).toBe(0);
  });

  it('pans with Shift + wheel and horizontal trackpad scroll, without zooming', async () => {
    const m = await mount();
    m.controller.setView({ x: -1000, k: 4 });
    const start = m.controller.getView();
    act(() => void wheel(m.svg, { deltaY: 100, shiftKey: true }));
    const afterShift = m.controller.getView();
    expect(afterShift.k).toBe(start.k);
    expect(afterShift.x).toBeCloseTo(start.x - 100);
    act(() => void wheel(m.svg, { deltaX: -60, deltaY: 3 }));
    expect(m.controller.getView().x).toBeCloseTo(afterShift.x + 60);
    expect(m.controller.getView().k).toBe(start.k);
  });

  it('clamps zoom to the timescale scale extents', async () => {
    const m = await mount();
    const { kMin, kMax } = data.index.timescale!.zoom;
    act(() => {
      for (let i = 0; i < 60; i++) wheel(m.svg, { deltaY: -500 });
    });
    expect(m.controller.getView().k).toBeCloseTo(kMax);
    act(() => {
      for (let i = 0; i < 60; i++) wheel(m.svg, { deltaY: 500 });
    });
    expect(m.controller.getView().k).toBeCloseTo(kMin);
    m.controller.setView({ x: 0, k: 1e6 });
    expect(m.controller.getView().k).toBeCloseTo(kMax);
  });

  it('keeps the chart on screen, and centres it when it is narrower than the view', async () => {
    const m = await mount();
    const cfg = data.index.timescale!;
    const w = totalWidth('scholarly', cfg);
    m.controller.setView({ x: 5000, k: 4 });
    expect(m.controller.getView().x).toBe(0);
    m.controller.setView({ x: -1e7, k: 4 });
    expect(m.controller.getView().x).toBeCloseTo(WIDTH - w * 4);
    m.controller.setView({ x: 0, k: cfg.zoom.kMin });
    expect(m.controller.getView().x).toBeCloseTo((WIDTH - w * cfg.zoom.kMin) / 2);
  });

  it('pans to a year and focuses on a span through the controller', async () => {
    // Reduced motion: the controller moves without animating.
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const m = await mount();
    m.controller.setView({ x: 0, k: 3 });
    const cfg = data.index.timescale!;
    m.controller.panToYear(-852, 'scholarly');
    act(() => void vi.advanceTimersByTime(1000));
    const { x, k } = m.controller.getView();
    const base = (WIDTH / 2 - x) / k;
    const { x: xOf } = await import('../../lib/layout/timescale');
    expect(base).toBeCloseTo(xOf(-852, 'scholarly', cfg), 0);

    m.controller.focusOn(100, 200, { animate: false });
    const v = m.controller.getView();
    expect(v.k).toBeCloseTo(Math.min(cfg.zoom.kMax, (WIDTH * 0.9) / 100));
    vi.unstubAllGlobals();
  });
});

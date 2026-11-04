// @vitest-environment happy-dom
import { createElement, Profiler, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { totalWidth } from '../../lib/layout/timescale';
import Chart from './Chart';
import type { ChartData } from './data/useChartData';
import { seedChartData } from './seed-data.testutil';
import { createChartStore, type ChartStore } from './state';
import { movedFar, WHEEL_END_MS, type ChartController } from './zoom';

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
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
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

/** A pointer event as a browser sends it (happy-dom drops fields it doesn't know; set them all). */
function pointer(svg: SVGSVGElement, type: string, init: Record<string, unknown>) {
  const all = { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0, ...init };
  const e = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(all)) {
    Object.defineProperty(e, key, { value, configurable: true });
  }
  return svg.dispatchEvent(e);
}

/** A touch event with the given finger positions; returns whether it was cancelled. */
function touch(svg: SVGSVGElement, type: string, fingers: [number, number][]) {
  const list = fingers.map(([clientX, clientY], identifier) => ({ identifier, clientX, clientY }));
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: list });
  Object.defineProperty(e, 'changedTouches', { value: list });
  Object.defineProperty(e, 'view', { value: window });
  svg.dispatchEvent(e);
  return e.defaultPrevented;
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
      // d3 blocks the click that ends a drag until a 0 ms timeout; let it run so the window's
      // click blocker doesn't outlive this test.
      vi.advanceTimersByTime(1);
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

  it('pans one-finger touches itself, with one commit at the end and y at 0', async () => {
    const m = await mount();
    m.controller.setView({ x: -400, k: 3 });
    const before = m.controller.getView();
    const commits = m.commits.count;
    act(() => {
      pointer(m.svg, 'pointerdown', { clientX: 500, clientY: 300 });
      pointer(m.svg, 'pointermove', { clientX: 450, clientY: 340 });
      pointer(m.svg, 'pointermove', { clientX: 380, clientY: 360 });
    });
    expect(m.commits.count).toBe(commits);
    expect(m.controller.getView()).toEqual({ x: before.x - 120, k: before.k });
    expect(parse(m.geometry.getAttribute('transform')).y).toBe(0);
    act(() => void pointer(m.svg, 'pointerup', { clientX: 380 }));
    expect(m.commits.count).toBe(commits + 1);
    expect(m.store.getSnapshot().committedViewport!.x).toBeCloseTo(before.x - 120);
  });

  it('leaves single-finger touches to the browser, so a vertical swipe scrolls the page', async () => {
    // d3 binds its touch handlers only on touch devices.
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const m = await mount();
    const before = m.controller.getView();
    // d3 never sees one finger, so it never cancels the touchmove (the page scroll).
    touch(m.svg, 'touchstart', [[500, 300]]);
    expect(touch(m.svg, 'touchmove', [[500, 100]])).toBe(false);
    touch(m.svg, 'touchend', []);
    // The browser took the vertical swipe: pointercancel, and no pan.
    act(() => {
      pointer(m.svg, 'pointerdown', { clientX: 500, clientY: 300 });
      pointer(m.svg, 'pointercancel', {});
    });
    expect(m.controller.getView()).toEqual(before);
    // Two fingers still go to d3 (pinch), which cancels the browser's handling.
    touch(m.svg, 'touchstart', [
      [400, 300],
      [600, 300],
    ]);
    expect(
      touch(m.svg, 'touchmove', [
        [350, 300],
        [650, 300],
      ]),
    ).toBe(true);
    act(() => void touch(m.svg, 'touchend', []));
  });

  it('ignores the tap that ends a touch pan, but not a later tap', async () => {
    const m = await mount();
    m.controller.setView({ x: -400, k: 3 });
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hit.setAttribute('data-select', 'reign:ahab');
    m.geometry.append(hit);
    act(() => {
      pointer(m.svg, 'pointerdown', { clientX: 500 });
      pointer(m.svg, 'pointermove', { clientX: 420 });
      pointer(m.svg, 'pointerup', { clientX: 420 });
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(m.store.getSnapshot().selection).toBeNull();
    act(() => void vi.advanceTimersByTime(500));
    act(() => void hit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(m.store.getSnapshot().selection).toEqual({ kind: 'reign', id: 'ahab' });
  });

  it('hands a pan to d3 when a second finger lands, and does not pan twice', async () => {
    const m = await mount();
    m.controller.setView({ x: -400, k: 3 });
    act(() => {
      pointer(m.svg, 'pointerdown', { pointerId: 1, clientX: 500 });
      pointer(m.svg, 'pointermove', { pointerId: 1, clientX: 480 });
      pointer(m.svg, 'pointerdown', { pointerId: 2, clientX: 600 });
      pointer(m.svg, 'pointerup', { pointerId: 2, clientX: 600 });
    });
    const after = m.controller.getView();
    // One finger left after a pinch: d3 keeps that gesture, our pan stays out of it.
    act(() => void pointer(m.svg, 'pointermove', { pointerId: 1, clientX: 400 }));
    expect(m.controller.getView()).toEqual(after);
    act(() => void pointer(m.svg, 'pointerup', { pointerId: 1, clientX: 400 }));
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
  it('moves a live setView without committing, and commits on the next plain setView', async () => {
    const m = await mount();
    const before = m.commits.count;
    const committed = m.store.getSnapshot().committedViewport;
    act(() => {
      for (let i = 1; i <= 10; i++) m.controller.setView({ x: -100 * i, k: 3 }, { live: true });
    });
    expect(m.commits.count).toBe(before);
    expect(m.store.getSnapshot().committedViewport).toBe(committed);
    expect(parse(m.geometry.getAttribute('transform')).x).toBeCloseTo(-1000);
    act(() => m.controller.setView({ x: -1100, k: 3 }));
    expect(m.store.getSnapshot().committedViewport).toMatchObject({ x: -1100, k: 3 });
  });
});

describe('movedFar', () => {
  it('needs half a screen of pan or a 1.25× zoom since the last commit', () => {
    expect(movedFar({ x: 0, k: 1 }, { x: -100, k: 1 }, 400)).toBe(false);
    expect(movedFar({ x: 0, k: 1 }, { x: -200, k: 1 }, 400)).toBe(true);
    expect(movedFar({ x: 0, k: 1 }, { x: 0, k: 1.2 }, 400)).toBe(false);
    expect(movedFar({ x: 0, k: 1 }, { x: 0, k: 1.25 }, 400)).toBe(true);
    expect(movedFar({ x: 0, k: 1 }, { x: 0, k: 0.75 }, 400)).toBe(true);
  });
});

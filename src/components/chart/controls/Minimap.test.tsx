// @vitest-environment happy-dom
import { act, createElement, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexEra } from '../../../lib/core/datafiles';
import { minimapLayout, viewToMinimap } from '../../../lib/layout/minimap';
import { totalWidth } from '../../../lib/layout/timescale';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import type { ChartController } from '../zoom';
import { KEY_STEP } from './Minimap';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WIDTH = 1000;
let seed: ChartData;
let data: ChartData;
let container: HTMLElement;
let root: Root | undefined;

/** A coming-soon era for the fixture index (a test placeholder, not biblical data). */
const soon = (id: string, order: number, weight = 1): IndexEra => ({
  id,
  slug: id,
  name_am: `ፈተና ${order}`,
  name_en: `Test ${order}`,
  certainty: 'approximate',
  status: 'coming_soon',
  order,
  minimap_weight: weight,
  x: { scholarly: null, traditional: null },
  tile: null,
});

beforeAll(async () => {
  seed = await seedChartData();
  const live = seed.index.eras.map((e) => ({ ...e, order: 10 }));
  // Out of order on purpose: the minimap sorts by `order`.
  data = {
    ...seed,
    index: { ...seed.index, eras: [soon('after', 20), ...live, soon('before', 1, 2)] },
  };
});
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true })); // reduced motion: no animations
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(store: ChartStore = createChartStore()) {
  container = document.createElement('div');
  document.body.append(container);
  const r = (root = createRoot(container));
  const commits = { count: 0 };
  let controller: ChartController | undefined;
  await act(async () =>
    r.render(
      createElement(
        Profiler,
        { id: 'chart', onRender: () => void commits.count++ },
        createElement(Chart, { data, store, onController: (c) => (controller = c) }),
      ),
    ),
  );
  const win = container.querySelector<HTMLElement>('.minimap-window')!;
  const era = (slug: string) =>
    container.querySelector<HTMLButtonElement>(`.minimap-era[data-era="${slug}"]`)!;
  return { store, controller: controller!, commits, win, era };
}

/** The window as viewToMinimap places it for the controller's view now. */
function expectedWindow(controller: ChartController, axis: 'scholarly' | 'traditional') {
  const layout = minimapLayout(data.index.eras, WIDTH, data.index.timescale);
  return viewToMinimap({ ...controller.getView(), width: WIDTH }, layout, axis)!;
}
const px = (s: string) => Number(s.replace('px', ''));

/** A pointer event with the fields happy-dom drops. */
function pointer(el: Element, type: string, clientX: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: 'mouse', button: 0, clientX })) {
    Object.defineProperty(e, k, { value: v, configurable: true });
  }
  el.dispatchEvent(e);
}

const nextFrame = () => new Promise((r) => setTimeout(r, 40));
const liveEra = () => data.index.eras.find((e) => e.status === 'live')!;

describe('Minimap', () => {
  it('shows every era in order, live ones in ink and coming-soon ones faded and labelled', async () => {
    const m = await mount();
    const boxes = [...container.querySelectorAll<HTMLElement>('.minimap-era')];
    expect(boxes.map((b) => b.dataset.era)).toEqual(['before', liveEra().slug, 'after']);
    expect(boxes.map((b) => b.classList.contains('is-soon'))).toEqual([true, false, true]);
    // Weights 2 : 1 : 1.
    expect(boxes.map((b) => px(b.style.width))).toEqual([500, 250, 250]);
    expect(m.era('before').getAttribute('aria-disabled')).toBe('true');
    expect(m.era('before').textContent).toContain(data.index.eras.at(-1)!.name_am);
    expect(m.era('before').querySelector('.minimap-soon')!.textContent).toBe('በቅርቡ');
    expect(m.era(liveEra().slug).hasAttribute('aria-disabled')).toBe(false);
    expect(m.era(liveEra().slug).querySelector('.minimap-soon')).toBeNull();
  });

  it('does nothing when a coming-soon era is tapped', async () => {
    const m = await mount();
    const focusOn = vi.spyOn(m.controller, 'focusOn');
    const setView = vi.spyOn(m.controller, 'setView');
    const before = m.controller.getView();
    await act(async () => m.era('before').click());
    expect(focusOn).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
    expect(m.controller.getView()).toEqual(before);
  });

  it("focuses a live era's span when it is tapped", async () => {
    const m = await mount();
    const focusOn = vi.spyOn(m.controller, 'focusOn');
    await act(async () => m.era(liveEra().slug).click());
    const span = liveEra().x.scholarly!;
    expect(focusOn).toHaveBeenCalledWith(span.x0, span.x1);
  });

  it('places the window over the visible range, and follows the chart imperatively', async () => {
    const m = await mount();
    const fit = expectedWindow(m.controller, 'scholarly');
    expect(px(m.win.style.left)).toBeCloseTo(fit.left, 3);
    expect(px(m.win.style.width)).toBeCloseTo(fit.width, 3);

    // A chart gesture: live (uncommitted) views, like a drag on the chart. No React commit.
    const commits = m.commits.count;
    act(() => m.controller.setView({ x: -2000, k: 4 }, { live: true }));
    await act(nextFrame);
    expect(m.commits.count).toBe(commits);
    const w = expectedWindow(m.controller, 'scholarly');
    expect(w.width).toBeLessThan(fit.width);
    expect(px(m.win.style.left)).toBeCloseTo(w.left, 3);
    expect(px(m.win.style.width)).toBeCloseTo(Math.max(w.width, 12), 3);
    expect(m.win.getAttribute('aria-valuetext')).toBe(liveEra().name_am);
  });

  it('pans the chart when the window is dragged, with no React commit until release', async () => {
    const m = await mount();
    const content = liveEra().x.scholarly!;
    const mid = (content.x0 + content.x1) / 2;
    act(() => m.controller.setView({ x: WIDTH / 2 - mid * 4, k: 4 }));
    await act(nextFrame);
    const setView = vi.spyOn(m.controller, 'setView');
    const commits = m.commits.count;
    const committed = m.store.getSnapshot().committedViewport;
    const start = m.controller.getView();

    act(() => {
      pointer(m.win, 'pointerdown', 300);
      for (let x = 310; x <= 400; x += 10) pointer(m.win, 'pointermove', x);
    });
    await act(nextFrame);
    expect(m.commits.count).toBe(commits);
    expect(m.store.getSnapshot().committedViewport).toBe(committed);
    expect(setView).toHaveBeenCalledTimes(10);
    expect(setView.mock.calls.every(([, o]) => o?.live === true)).toBe(true);
    const moved = m.controller.getView();
    expect(moved.k).toBe(start.k);
    // Dragging right shows later years: the chart moves left. 100 strip px in the live box
    // (250 px wide for the whole content span) is 100 / 250 of the content.
    expect((start.x - moved.x) / moved.k).toBeCloseTo(((content.x1 - content.x0) * 100) / 250, 0);
    // The window moved with it.
    expect(px(m.win.style.left)).toBeCloseTo(expectedWindow(m.controller, 'scholarly').left, 3);

    await act(async () => pointer(m.win, 'pointerup', 400));
    expect(setView.mock.calls.at(-1)![1]).toEqual({ live: false });
    expect(m.store.getSnapshot().committedViewport).toMatchObject({ x: moved.x, k: moved.k });
  });

  it('clamps a drag past the end of the strip to the end of the chart', async () => {
    const m = await mount();
    act(() => m.controller.setView({ x: 0, k: 4 }));
    await act(async () => {
      pointer(m.win, 'pointerdown', 300);
      pointer(m.win, 'pointermove', 5000);
      pointer(m.win, 'pointerup', 5000);
    });
    const cfg = data.index.timescale!;
    expect(m.controller.getView().x).toBeCloseTo(WIDTH - totalWidth('scholarly', cfg) * 4, 3);
  });

  it('pans with the keyboard: arrows by a tenth of the view, Home and End to the ends', async () => {
    const m = await mount();
    act(() => m.controller.setView({ x: -1000, k: 4 }));
    const key = (k: string) =>
      act(async () =>
        m.win.dispatchEvent(
          new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
        ),
      );
    await key('ArrowRight');
    expect(m.controller.getView().x).toBeCloseTo(-1000 - KEY_STEP * WIDTH, 6);
    await key('ArrowLeft');
    await key('ArrowLeft');
    expect(m.controller.getView().x).toBeCloseTo(-1000 + KEY_STEP * WIDTH, 6);
    await key('PageDown');
    expect(m.controller.getView().x).toBeCloseTo(-1000 + KEY_STEP * WIDTH - WIDTH, 6);
    await key('Home');
    expect(m.controller.getView().x).toBe(0);
    await key('End');
    const cfg = data.index.timescale!;
    expect(m.controller.getView().x).toBeCloseTo(WIDTH - totalWidth('scholarly', cfg) * 4, 3);
    // Each key press is a finished move: it commits.
    expect(m.store.getSnapshot().committedViewport!.x).toBeCloseTo(m.controller.getView().x, 6);
    expect(m.win.getAttribute('role')).toBe('slider');
    expect(m.win.tabIndex).toBe(0);
  });

  it('follows the axis: the window is placed on the traditional spans after a switch', async () => {
    const m = await mount();
    await act(async () => m.store.setAxis('traditional'));
    const w = expectedWindow(m.controller, 'traditional');
    expect(m.win.style.display).toBe('');
    expect(px(m.win.style.left)).toBeCloseTo(w.left, 3);
  });
});

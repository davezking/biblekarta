// @vitest-environment happy-dom
import { act, createElement, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGeez } from '../../../lib/core/geez';
import { createT } from '../../../lib/i18n';
import { x as yearToX } from '../../../lib/layout/timescale';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import { WHEEL_END_MS, type ChartController } from '../zoom';
import { axisLabels, captionText, LABEL_PAD_PX, placeRow } from './AxisLayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = createT('am');
let data: ChartData;
let container: HTMLElement;
let root: Root;

beforeAll(async () => {
  data = await seedChartData();
});
beforeEach(() => {
  vi.useFakeTimers();
  // happy-dom shims, as in zoom.test.ts: no SVG point maths, no clientLeft/Top on SVG.
  Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
    value: undefined,
    configurable: true,
  });
  for (const key of ['clientLeft', 'clientTop']) {
    Object.defineProperty(SVGSVGElement.prototype, key, { value: 0, configurable: true });
  }
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Mounted {
  svg: SVGSVGElement;
  store: ChartStore;
  controller: ChartController;
  commits: { count: number };
}

async function mount(width: number): Promise<Mounted> {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
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
  return {
    svg: container.querySelector('svg.chart-svg') as SVGSVGElement,
    store,
    controller: controller!,
    commits,
  };
}

/** The labels on a row that are shown (not dropped). */
const shown = (svg: SVGSVGElement, row: 'top' | 'bottom') =>
  [...svg.querySelectorAll(`g.axis-${row} text.axis-label`)].filter(
    (el) => el.getAttribute('visibility') !== 'hidden',
  );
const bc = (el: Element) => 1 - Number(el.getAttribute('data-year'));

function wheel(svg: SVGSVGElement, init: WheelEventInit) {
  const all = { clientX: 500, clientY: 0, deltaX: 0, deltaY: 0, deltaMode: 0, ...init };
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...all });
  for (const [key, value] of Object.entries({ shiftKey: false, ctrlKey: false, ...all })) {
    Object.defineProperty(e, key, { value, configurable: true });
  }
  svg.dispatchEvent(e);
}

/** Lets the viewport channel's animation frame run. */
const frame = () => act(() => void vi.advanceTimersByTime(20));

describe('AxisLayer', () => {
  it('labels centuries and half-centuries at the whole-era zoom on a phone', async () => {
    const m = await mount(320);
    const cfg = data.index.timescale!;
    expect(m.controller.getView().k).toBeCloseTo(cfg.zoom.kMin);
    // 1000 BC sits under the era caption at the left edge, so it is dropped.
    expect(shown(m.svg, 'top').map(bc)).toEqual([950, 900, 850, 800]);
    expect(shown(m.svg, 'bottom').map((el) => el.textContent)).toEqual([
      '950',
      '900',
      '850',
      '800',
    ]);
    const levels = [...m.svg.querySelectorAll('g.axis-top text.axis-label')].map(bc);
    expect(levels.every((y) => y % 50 === 0)).toBe(true);
  });

  it('labels single years when zoomed in on 850 BC', async () => {
    const m = await mount(1200);
    const cfg = data.index.timescale!;
    act(() => {
      const k = cfg.zoom.kMax;
      m.controller.setView({
        x: 600 - (yearToX(-849, 'scholarly', cfg) + cfg.pxPerYear / 2) * k,
        k,
      });
      vi.advanceTimersByTime(20);
    });
    frame();
    const bottom = shown(m.svg, 'bottom').map((el) => Number(el.textContent));
    expect(bottom).toContain(850);
    // Consecutive years are labelled (the Arabic row has room for every one).
    for (const y of [851, 849, 848]) expect(bottom).toContain(y);
    expect(bottom.length).toBeGreaterThan(10);
    // The longer Ge'ez numerals drop some years rather than overlap, but single years show.
    expect(shown(m.svg, 'top').some((el) => bc(el) % 10 !== 0)).toBe(true);
  });

  it('writes valid Ge’ez numerals for the BC year on top, with half-centuries in red', async () => {
    const m = await mount(1200);
    const top = [...m.svg.querySelectorAll('g.axis-top text.axis-label')];
    expect(top.length).toBeGreaterThan(0);
    for (const el of top) expect(fromGeez(el.textContent!)).toBe(bc(el));
    const red = top.filter((el) => el.classList.contains('axis-red')).map(bc);
    expect(red).toEqual([950, 850]);
    expect(top.find((el) => bc(el) === 900)!.textContent).toBe('፱፻');
    // The bottom row is Arabic and never red; captions name the era.
    for (const el of m.svg.querySelectorAll('g.axis-bottom text.axis-label')) {
      expect(el.textContent).toBe(String(bc(el)));
      expect(el.classList.contains('axis-red')).toBe(false);
    }
    const captions = [...m.svg.querySelectorAll('text.axis-caption')].map((c) => c.textContent);
    expect(captions).toEqual(['ዓ.ዓ.', 'ዓ.ዓ.']);
  });

  it('puts no text inside the x-scaled geometry or overlay groups', async () => {
    const m = await mount(1200);
    expect(m.svg.querySelectorAll('g.chart-labels text.axis-label').length).toBeGreaterThan(0);
    expect(m.svg.querySelectorAll('g.chart-geometry text')).toHaveLength(0);
    expect(m.svg.querySelectorAll('g.chart-overlay text')).toHaveLength(0);
    expect(m.svg.querySelectorAll('g.chart-grid text')).toHaveLength(0);
  });

  it('re-places labels imperatively during a gesture, with one commit at its end', async () => {
    const m = await mount(1200);
    const cfg = data.index.timescale!;
    act(() => {
      m.controller.setView({ x: -2000, k: 3 });
      vi.advanceTimersByTime(20);
    });
    const label = () => m.svg.querySelector('g.axis-bottom text[data-year="-849"]')!;
    const x0 = Number(label().getAttribute('x'));
    expect(x0).toBeCloseTo(3 * yearToX(-849, 'scholarly', cfg) - 2000, 0);
    const before = m.commits.count;
    const ticksBefore = m.svg.querySelectorAll('text.axis-label').length;

    for (let i = 0; i < 10; i++) {
      act(() => {
        wheel(m.svg, { deltaY: 10, shiftKey: true });
        vi.advanceTimersByTime(20);
      });
    }
    // Panned 100 px left: the label moved with it, and React did not render.
    expect(Number(label().getAttribute('x'))).toBeCloseTo(x0 - 100, 0);
    expect(m.commits.count).toBe(before);
    expect(m.svg.querySelectorAll('text.axis-label')).toHaveLength(ticksBefore);

    act(() => void vi.advanceTimersByTime(WHEEL_END_MS));
    expect(m.commits.count).toBe(before + 1);
    expect(Number(label().getAttribute('x'))).toBeCloseTo(x0 - 100, 0);
  });

  it('shows AA years with the traditional prefix on the traditional axis', async () => {
    const m = await mount(1200);
    await act(async () => m.store.setAxis('traditional'));
    frame();
    const bottom = shown(m.svg, 'bottom');
    expect(bottom.length).toBeGreaterThan(0);
    for (const el of bottom) expect(el.textContent).toBe(el.getAttribute('data-year'));
    for (const el of shown(m.svg, 'top')) {
      expect(fromGeez(el.textContent!)).toBe(Number(el.getAttribute('data-year')));
    }
    expect(m.svg.querySelector('text.axis-caption')!.textContent).toBe(
      t('axis.traditional.prefix'),
    );
  });
});

describe('axisLabels / placeRow', () => {
  it('marks AD labels with their era where a range crosses 1 BC / AD 1', () => {
    const cfg = { ...data.index.timescale!, scholarly: { min: -60, max: 60 } };
    const k = 1;
    const v = { x: -yearToX(-40, 'scholarly', cfg), k, width: 100 * cfg.pxPerYear };
    const labels = axisLabels('scholarly', v, cfg, t);
    const ad = labels.find((l) => l.year === 10)!;
    expect(ad.era).toBe('AD');
    expect(ad.arabic).toBe(t('date.ad', { year: 10 }));
    expect(labels.find((l) => l.year === -9)!.arabic).toBe('10');
    expect(captionText('scholarly', 'AD', t)).toBe('ዓ.ም.');
  });

  it('drops a label rather than overlap, keeping the coarser level', () => {
    const v = { x: 0, k: 1, width: 1000 };
    const labels = [
      { x: 100, level: 'decade' as const },
      { x: 130, level: 'century' as const },
      { x: 300, level: 'year' as const },
      { x: 990, level: 'year' as const },
    ];
    const xs = placeRow(labels, [40, 40, 40, 40], v, 0);
    expect(xs).toEqual([null, 130, 300, null]);
    // Far enough apart, both stay.
    expect(placeRow(labels.slice(0, 2), [10, 10], v, 0)).toEqual([100, 130]);
    // The caption's space on the left is kept clear.
    expect(placeRow([{ x: 20, level: 'century' }], [20], v, 15)).toEqual([null]);
    expect(LABEL_PAD_PX).toBeGreaterThan(0);
  });
});

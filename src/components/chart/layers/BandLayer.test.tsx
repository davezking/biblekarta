// @vitest-environment happy-dom
import { act, createElement, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexEra } from '../../../lib/core/datafiles';
import { x } from '../../../lib/layout/timescale';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import type { ChartController } from '../zoom';
import { bandOn, gapLabels } from './BandLayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let seed: ChartData;
let container: HTMLElement;
let root: Root;

beforeAll(async () => {
  seed = await seedChartData();
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

/** The seed with a test tradition-only band (and the scholarly domain moved right to make room). */
function withBand(data: ChartData): ChartData {
  const cfg = data.index.timescale!;
  return {
    ...data,
    index: {
      ...data.index,
      timescale: { ...cfg, band: { aaMin: 1, aaMax: 2000, widthPx: 240, gapPx: 24 } },
    },
  };
}

/** The seed with a gap era spanning base x 400–600 on both axes. */
function withGap(data: ChartData): ChartData {
  const gap: IndexEra = {
    ...data.index.eras[0]!,
    id: 'test-gap',
    slug: 'test-gap',
    gap: true,
    x: { scholarly: { x0: 400, x1: 600 }, traditional: { x0: 100, x1: 300 } },
  };
  return { ...data, index: { ...data.index, eras: [...data.index.eras, gap] } };
}

async function render(data: ChartData, store: ChartStore = createChartStore()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const commits = { count: 0 };
  let controller: ChartController | undefined;
  await act(async () =>
    root.render(
      createElement(
        Profiler,
        { id: 'chart', onRender: () => void commits.count++ },
        <Chart data={data} store={store} onController={(c) => (controller = c)} />,
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

const xOf = (el: Element) => Number(el.getAttribute('x'));

describe('BandLayer', () => {
  it('draws nothing when the config has no band and no era is a gap', async () => {
    expect(seed.index.timescale!.band).toBeNull();
    const { svg } = await render(seed);
    expect(svg.querySelector('rect.band-tint')).toBeNull();
    expect(svg.querySelectorAll('.band-label, .gap-label')).toHaveLength(0);
  });

  it('draws the band left of the earliest scholarly year, with its label in screen space', async () => {
    const data = withBand(seed);
    const cfg = data.index.timescale!;
    const { svg } = await render(data);
    const rect = svg.querySelector('g.chart-geometry rect.band-tint')!;
    expect(Number(rect.getAttribute('x'))).toBe(0);
    const right = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'));
    expect(right).toBe(240);
    // The gap separates the band from the scholarly domain.
    expect(x(cfg.scholarly.min, 'scholarly', cfg)).toBe(right + 24);

    const label = svg.querySelector('g.chart-labels text.band-label')!;
    expect(label.textContent).toBe('ትውፊት ብቻ');
    expect(svg.querySelectorAll('g.chart-geometry text')).toHaveLength(0);
    expect(bandOn('scholarly', cfg)).toEqual(cfg.band);
  });

  it('places the band label at the band centre on screen (k * cx + vx)', async () => {
    const { svg, store, controller } = await render(withBand(seed));
    await act(async () => controller.setView({ x: -40, k: 2 }));
    // The chart clamps the view to its extent; place against the view it committed.
    const v = store.getSnapshot().committedViewport!;
    expect(v.k).toBeCloseTo(2, 6);
    const label = svg.querySelector('text.band-label')!;
    expect(xOf(label)).toBeCloseTo(v.k * 120 + v.x, 1);
  });

  it('draws no band on the traditional axis', async () => {
    const data = withBand(seed);
    const { svg, store } = await render(data);
    expect(svg.querySelector('rect.band-tint')).not.toBeNull();
    await act(async () => store.setAxis('traditional'));
    expect(svg.querySelector('rect.band-tint')).toBeNull();
    expect(svg.querySelector('.band-label')).toBeNull();
    expect(bandOn('traditional', data.index.timescale!)).toBeNull();
  });

  it('centres a label in each gap era, on either axis', async () => {
    const data = withGap(seed);
    expect(gapLabels('scholarly', data.index.eras)).toEqual([{ id: 'test-gap', cx: 500 }]);
    expect(gapLabels('traditional', data.index.eras)).toEqual([{ id: 'test-gap', cx: 200 }]);
    const { svg, store } = await render(data);
    const label = svg.querySelector('g.chart-labels text.gap-label[data-gap="test-gap"]')!;
    expect(label.textContent).toBe('የዘመን ክፍተት');
    expect(label.getAttribute('data-cx')).toBe('500');
    await act(async () => store.setAxis('traditional'));
    expect(svg.querySelector('text.gap-label')!.getAttribute('data-cx')).toBe('200');
  });

  it('skips gap eras with no span on the axis', () => {
    const era = { ...seed.index.eras[0]!, gap: true, x: { scholarly: null, traditional: null } };
    expect(gapLabels('scholarly', [era])).toEqual([]);
  });

  it('re-places its labels during a gesture with no React render', async () => {
    vi.useFakeTimers();
    try {
      const { svg, controller, commits } = await render(withGap(seed));
      act(() => {
        controller.setView({ x: 0, k: 1 });
        vi.advanceTimersByTime(20);
      });
      const label = svg.querySelector('text.gap-label')!;
      const x0 = xOf(label);
      expect(x0).toBeCloseTo(500, 1);
      const before = commits.count;
      for (let i = 0; i < 5; i++) {
        act(() => {
          svg.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: 10,
              shiftKey: true,
              bubbles: true,
              cancelable: true,
            }),
          );
          vi.advanceTimersByTime(20);
        });
      }
      expect(xOf(label)).not.toBeCloseTo(x0, 1);
      expect(commits.count).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

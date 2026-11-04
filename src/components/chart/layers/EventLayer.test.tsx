// @vitest-environment happy-dom
import { act, createElement, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { touchTarget } from '../../../lib/core/tokens';
import { fixedWidthMeasure } from '../../../lib/layout/lod';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import type { ChartController } from '../zoom';
import { EVENT_MARK, eventItems, itemLabels, type ScreenItem } from './EventLayer';

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

/**
 * The seed with the kingdom split redrawn as a streamless span (only its layout position and
 * type change; no dates or titles are invented), to test span bars and the top-lane fallback.
 */
function withSpan(data: ChartData): ChartData {
  const geo = data.tile.axes.scholarly;
  return {
    ...data,
    tile: {
      ...data.tile,
      events: data.tile.events.map((e) =>
        e.id === 'kingdom-split' ? { ...e, type: 'span' as const } : e,
      ),
      axes: {
        ...data.tile.axes,
        scholarly: {
          ...geo,
          events: geo.events.map((e) =>
            e.event_id === 'kingdom-split' ? { ...e, stream_id: null, x0: 500, x1: 700 } : e,
          ),
        },
      },
    },
  };
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

const item = (svg: SVGSVGElement, id: string) =>
  svg.querySelector<SVGGElement>(`g.chart-labels g[data-item="event:${id}"]`)!;
const t = (k: string) => k;
const measure = fixedWidthMeasure(16, 13, 0.85);

/** The chart y range of a lane, after the axis band. */
function laneRange(svg: SVGSVGElement, laneId: string) {
  const g = svg.querySelector(`g.chart-geometry g[data-lane="${laneId}"]`)!;
  const y0 = Number(/translate\(0,([\d.]+)\)/.exec(g.getAttribute('transform')!)![1]);
  const lane = seed.index.layout!.scholarly.lanes.find((l) => l.id === laneId)!;
  return [y0, y0 + lane.height] as const;
}

describe('EventLayer', () => {
  it('draws a point event as a ፨ mark, and its title in screen space', async () => {
    const { svg, controller } = await render(seed);
    await act(async () => controller.setView({ x: -400, k: 3 }));
    const g = item(svg, 'temple-built');
    expect(g.getAttribute('data-point')).toBe('true');
    expect(g.querySelector('.item-mark')!.textContent).toBe(EVENT_MARK);
    // The temple (approximate, 966 BC) carries the "በግምት" form.
    expect(g.querySelector('text.item-title')!.textContent).toBe('ቤተ መቅደስ ተሠራ (በግምት 966 ዓ.ዓ.)');
    expect(svg.querySelectorAll('g.chart-geometry text')).toHaveLength(0);
    expect(svg.querySelector('g.chart-geometry [data-event-bar="temple-built"]')).toBeNull();
  });

  it("puts Board 5's events in their streams' lanes", async () => {
    const { svg } = await render(seed);
    const items = new Map(
      eventItems({ ...seed, axis: 'scholarly', laneY: laneYOf(svg), t }).map((i) => [i.key, i]),
    );
    const lanes = {
      'temple-built': 'united',
      'kingdom-split': 'united',
      'shishak-invasion': 'egypt',
      'battle-of-qarqar': 'assyria',
      'jehu-tribute': 'assyria',
    };
    for (const [id, lane] of Object.entries(lanes)) {
      const it = items.get(`event:${id}`)!;
      const [y0, y1] = laneRange(svg, lane);
      expect(it.cy).toBeGreaterThan(y0);
      expect(it.cy).toBeLessThan(y1);
      // The hit target is centred on the slot.
      const hit = item(svg, id).querySelector('rect.item-hit')!;
      const hy = Number(hit.getAttribute('y')) + Number(hit.getAttribute('height')) / 2;
      expect(hy).toBeCloseTo(it.cy, 6);
      expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(touchTarget);
    }
  });

  it('draws a span event as a thin bar, and a streamless one in the top lane', async () => {
    const data = withSpan(seed);
    const { svg } = await render(data);
    const bar = svg.querySelector('g.chart-geometry rect[data-event-bar="kingdom-split"]')!;
    expect(Number(bar.getAttribute('x'))).toBe(500);
    expect(Number(bar.getAttribute('width'))).toBe(200);
    expect(Number(bar.getAttribute('height'))).toBeLessThanOrEqual(6);
    const [y0, y1] = laneRange(svg, 'prophets');
    const cy = Number(bar.getAttribute('y')) + Number(bar.getAttribute('height')) / 2;
    expect(cy).toBeGreaterThan(y0);
    expect(cy).toBeLessThan(y1);
    expect(item(svg, 'kingdom-split').getAttribute('data-point')).toBeNull();
  });

  it('letters titles by importance: the higher wins a collision', () => {
    const a = { key: 'a', group: 'g', x0: 100, x1: 101, cy: 0, h: 32, point: true, dashed: false };
    const items: ScreenItem[] = [
      {
        ...a,
        importance: 3,
        texts: ['ሁለተኛ'],
        size: 'years',
        inkColor: '#000',
        tip: { name: 'b', years: '' },
        key: 'low',
        x0: 120,
        x1: 121,
      },
      {
        ...a,
        importance: 5,
        texts: ['አንደኛ ረጅም ርዕስ', 'አንደኛ'],
        size: 'years',
        inkColor: '#000',
        tip: { name: 'a', years: '' },
      },
    ];
    const at1 = itemLabels(items, 1, measure);
    expect(at1.get('a')!.text).toBe('አንደኛ ረጅም ርዕስ');
    expect(at1.has('low')).toBe(false);
    // Zoomed in far enough, both fit.
    expect(itemLabels(items, 20, measure).has('low')).toBe(true);
  });

  it('gives an event whose title is hidden a tooltip on hover, and selects it on tap', async () => {
    const { svg, store, controller } = await render(seed);
    await act(async () => controller.setView({ x: 0, k: 1 }));
    // Jehu's tribute loses to the battle of Qarqar (importance 4 > 3) in Assyria's row.
    const g = item(svg, 'jehu-tribute');
    expect(g.querySelector('text.item-title')).toBeNull();
    const hit = g.querySelector('rect.item-hit')!;
    await act(async () => {
      hit.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerType: 'mouse',
          clientX: 10,
          clientY: 10,
        }),
      );
    });
    const tip = svg.querySelector('g.chart-event-items .item-tooltip')!;
    expect(tip.getAttribute('visibility')).toBeNull();
    expect(tip.getAttribute('data-tip-for')).toBe('event:jehu-tribute');
    expect(tip.querySelector('.tooltip-name')!.textContent).toBe('የኢዩ ግብር');

    await act(async () => {
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(store.getSnapshot().selection).toEqual({ kind: 'event', id: 'jehu-tribute' });
  });

  it('re-places its items during a gesture with no React render', async () => {
    vi.useFakeTimers();
    try {
      const { svg, controller, commits } = await render(seed);
      act(() => {
        controller.setView({ x: 0, k: 1 });
        vi.advanceTimersByTime(20);
      });
      const hit = item(svg, 'temple-built').querySelector('rect.item-hit')!;
      const x0 = Number(hit.getAttribute('x'));
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
      expect(Number(hit.getAttribute('x'))).not.toBeCloseTo(x0, 1);
      expect(commits.count).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

function laneYOf(svg: SVGSVGElement): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of svg.querySelectorAll('g.chart-geometry g[data-lane]')) {
    out.set(
      g.getAttribute('data-lane')!,
      Number(/translate\(0,([\d.]+)\)/.exec(g.getAttribute('transform')!)![1]),
    );
  }
  return out;
}

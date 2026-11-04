// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { touchTarget } from '../../../lib/core/tokens';
import type { PersonSpan } from '../../../lib/layout/streams';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import type { ChartController } from '../zoom';
import { personItems } from './ProphetLayer';

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
 * The seed with people spans added on the scholarly axis, and the streams' row counts to match.
 * Only layout positions are made up here (the seed gives these people no dates); no dates, names
 * or references are invented.
 */
function withSpans(data: ChartData, spans: PersonSpan[], rows: Record<string, number>): ChartData {
  const geo = data.tile.axes.scholarly;
  return {
    ...data,
    tile: {
      ...data.tile,
      axes: {
        ...data.tile.axes,
        scholarly: {
          ...geo,
          bands: geo.bands.map((b) =>
            b.stream_id in rows ? { ...b, rows: rows[b.stream_id]! } : b,
          ),
          people: [...geo.people, ...spans],
        },
      },
    },
  };
}

const span = (
  person_id: string,
  stream_id: string,
  x0: number,
  x1: number,
  row = 0,
  dashed = false,
): PersonSpan => ({
  person_id,
  stream_id,
  x0,
  x1,
  row,
  dashed,
});

/** Two overlapping prophets (packed into two rows), one approximate, and Ethbaal's point in Sidon. */
const prophets = (data: ChartData) =>
  withSpans(
    data,
    [
      span('elijah', 'prophets', 900, 1100, 0, true),
      span('ahijah', 'prophets', 1000, 1200, 1, false),
      span('ethbaal', 'sidon', 950, 953),
    ],
    { prophets: 2 },
  );

async function render(data: ChartData, store: ChartStore = createChartStore()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  let controller: ChartController | undefined;
  await act(async () =>
    root.render(<Chart data={data} store={store} onController={(c) => (controller = c)} />),
  );
  return {
    svg: container.querySelector('svg.chart-svg') as SVGSVGElement,
    store,
    controller: controller!,
  };
}

const pill = (svg: SVGSVGElement, id: string) =>
  svg.querySelector<SVGRectElement>(`g.chart-geometry rect[data-person-span="${id}"]`)!;
const box = (el: Element) => {
  const y = Number(el.getAttribute('y'));
  return {
    x0: Number(el.getAttribute('x')),
    x1: Number(el.getAttribute('x')) + Number(el.getAttribute('width')),
    y0: y,
    y1: y + Number(el.getAttribute('height')),
  };
};

describe('ProphetLayer', () => {
  it("keeps Elisha's approximate span (848–797) dashed", async () => {
    const { svg } = await render(seed);
    const elisha = seed.tile.axes.scholarly.reigns.find((r) => r.reign_id === 'elisha')!;
    expect(elisha.stream_id).toBe('prophets');
    expect(elisha.dashed).toBe(true);
    // A prophet with a reign is drawn as that reign: dashed, and named with the "በግምት" form.
    const rect = svg.querySelector('g[data-reign-segment="elisha"] rect.reign-fill')!;
    expect(rect.classList.contains('reign-dashed')).toBe(true);
  });

  it('draws a dashed outline for an approximate span and a solid one otherwise', async () => {
    const { svg } = await render(prophets(seed));
    expect(pill(svg, 'elijah').classList.contains('item-dashed')).toBe(true);
    expect(pill(svg, 'ahijah').classList.contains('item-dashed')).toBe(false);
    expect(pill(svg, 'elijah').getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(svg.querySelectorAll('g.chart-geometry text')).toHaveLength(0);
  });

  it('stacks overlapping prophets in their rows, so they never overlap', async () => {
    const { svg } = await render(prophets(seed));
    const [a, b] = [box(pill(svg, 'elijah')), box(pill(svg, 'ahijah'))];
    expect(a.x1 > b.x0 && b.x1 > a.x0).toBe(true); // they overlap in time…
    expect(a.y1 <= b.y0 || b.y1 <= a.y0).toBe(true); // …but not on screen
    // The rows come packed from the compiler (streams.ts); the layer keeps them apart.
    const items = personItems({
      ...prophets(seed),
      axis: 'scholarly',
      laneY: new Map([['prophets', 36]]),
      t: (k) => k,
    });
    const cy = (key: string) => items.find((i) => i.key === key)!.cy;
    expect(Math.abs(cy('person:elijah') - cy('person:ahijah'))).toBeGreaterThanOrEqual(items[0]!.h);
  });

  it('draws a person known by one date as a marker in their lane, with no pill', async () => {
    const { svg } = await render(prophets(seed));
    expect(pill(svg, 'ethbaal')).toBeNull();
    const g = svg.querySelector('g.chart-labels g[data-item="person:ethbaal"]')!;
    expect(g.getAttribute('data-point')).toBe('true');
    expect(g.querySelector('circle.item-mark')).not.toBeNull();
  });

  it('letters names in screen space and makes each person selectable with a ≥ 44 px target', async () => {
    const { svg, store, controller } = await render(prophets(seed));
    await act(async () => controller.setView({ x: -1500, k: 2.4 }));
    const g = svg.querySelector('g.chart-labels g[data-item="person:elijah"]')!;
    expect(g.querySelector('text.item-title')!.textContent).toBe('ኤልያስ');
    const hit = g.querySelector('rect.item-hit')!;
    expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(touchTarget);
    expect(Number(hit.getAttribute('width'))).toBeGreaterThanOrEqual(touchTarget);
    await act(async () => {
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(store.getSnapshot().selection).toEqual({ kind: 'person', id: 'elijah' });
  });
});

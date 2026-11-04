// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonSpan } from '../../../lib/layout/streams';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore } from '../state';
import type { ChartController } from '../zoom';
import {
  FIGURE_MAX_PX,
  FIGURE_GAP_PX,
  FIGURE_MIN_PX,
  FIGURE_PAD_PX,
  figureSize,
  figureX,
  hasFigure,
} from './FigureLayer';

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
 * The seed with a span for the Queen of Sheba in the Ethiopia lane. The seed gives her no dates, so
 * the compiler leaves her unplaced; only a layout position is made up here (no dates invented).
 */
function withSheba(data: ChartData): ChartData {
  const geo = data.tile.axes.scholarly;
  const sheba: PersonSpan = {
    person_id: 'queen-of-sheba',
    stream_id: 'ethiopia',
    x0: 300,
    x1: 520,
    row: 0,
    dashed: true,
  };
  return {
    ...data,
    tile: {
      ...data.tile,
      axes: { ...data.tile.axes, scholarly: { ...geo, people: [...geo.people, sheba] } },
    },
  };
}

async function render(data: ChartData) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  let controller: ChartController | undefined;
  await act(async () =>
    root.render(
      <Chart data={data} store={createChartStore()} onController={(c) => (controller = c)} />,
    ),
  );
  return {
    svg: container.querySelector('svg.chart-svg') as SVGSVGElement,
    controller: controller!,
  };
}

const figures = (svg: SVGSVGElement) => [
  ...svg.querySelectorAll<SVGGElement>('g.chart-figures g[data-figure]'),
];
const visible = (svg: SVGSVGElement) =>
  figures(svg)
    .filter((g) => g.getAttribute('visibility') !== 'hidden')
    .map((g) => g.dataset.person);

describe('FigureLayer', () => {
  it('gives a figure to people of importance ≥ 4 and to every prophet', async () => {
    expect(hasFigure({ importance: 4, figure_kind: 'king' })).toBe(true);
    expect(hasFigure({ importance: 3, figure_kind: 'king' })).toBe(false);
    expect(hasFigure({ importance: 1, figure_kind: 'prophet' })).toBe(true);
    const { svg } = await render(seed);
    const people = figures(svg)
      .map((g) => g.dataset.person)
      .sort();
    // David, Solomon (5), Ahab, Jehu (4) and the prophet Elisha (3); not Asa (3) or Hazael (2).
    expect(people).toEqual(['ahab', 'david', 'elisha', 'jehu', 'solomon']);
  });

  it('sizes a figure to its slot, 24–40 px', () => {
    expect(figureSize(32)).toBe(FIGURE_MIN_PX);
    expect(figureSize(10)).toBe(FIGURE_MIN_PX);
    expect(figureSize(108)).toBe(FIGURE_MAX_PX);
    expect(figureSize(44)).toBe(33);
  });

  it('shows a figure only when its segment is wide enough on screen', async () => {
    const s = { x0: 100, x1: 140, size: 30, labelW: 0 };
    // 40 px wide at k = 1: too narrow for 30 + 2 × 6.
    expect(figureX(s, { x: 0, k: 1, width: 1200 })).toBeNull();
    expect(figureX(s, { x: 0, k: 2, width: 1200 })).toBe(200 + FIGURE_PAD_PX);
    // Off screen: hidden.
    expect(figureX(s, { x: -1000, k: 2, width: 1200 })).toBeNull();
    // With a label: just left of it, and only where there is room for both.
    const labelled = { x0: 0, x1: 200, size: 30, labelW: 80 };
    expect(figureX(labelled, { x: 0, k: 1, width: 1200 })).toBe(100 - 40 - FIGURE_GAP_PX - 30);
    expect(figureX({ ...labelled, x1: 110 }, { x: 0, k: 1, width: 1200 })).toBeNull();

    const { svg, controller } = await render(seed);
    await act(async () => controller.setView({ x: 0, k: 1 }));
    // Solomon's reign is wide at k = 1; David's (open start, a few px) never fits.
    expect(visible(svg)).toContain('solomon');
    expect(visible(svg)).not.toContain('david');
  });

  it('is aria-hidden, untappable, and draws from the sprite with <use>', async () => {
    const { svg, controller } = await render(seed);
    await act(async () => controller.setView({ x: 0, k: 1 }));
    const root = svg.querySelector('g.chart-figures')!;
    expect(root.closest('g.chart-labels')).not.toBeNull();
    expect(root.getAttribute('aria-hidden')).toBe('true');
    const solomon = figures(svg).find((g) => g.dataset.person === 'solomon')!;
    const fig = solomon.querySelector('svg.figure')!;
    expect(fig.getAttribute('aria-hidden')).toBe('true');
    expect(fig.querySelector('use')!.getAttribute('href')).toBe('#fig-king');
    expect(root.querySelectorAll('path, circle, ellipse')).toHaveLength(0);
    // The sprite it points at is mounted once.
    expect(svg.querySelectorAll('#fig-king')).toHaveLength(1);
    const elisha = figures(svg).find((g) => g.dataset.person === 'elisha')!;
    expect(elisha.querySelector('use')!.getAttribute('href')).toBe('#fig-prophet');
  });

  it('puts the Queen of Sheba, with her figure, in the Ethiopia lane', async () => {
    const { svg, controller } = await render(withSheba(seed));
    await act(async () => controller.setView({ x: 0, k: 1 }));
    const g = figures(svg).find((f) => f.dataset.person === 'queen-of-sheba')!;
    expect(g.getAttribute('visibility')).toBeNull();
    expect(g.querySelector('use')!.getAttribute('href')).toBe('#fig-queen');
    const lane = svg.querySelector('g.chart-geometry g[data-lane="ethiopia"]')!;
    const top = Number(/translate\(0,([\d.]+)\)/.exec(lane.getAttribute('transform')!)![1]);
    const height = seed.index.layout!.scholarly.lanes.find((l) => l.id === 'ethiopia')!.height;
    const ty = Number(/translate\([\d.]+,([\d.]+)\)/.exec(g.getAttribute('transform')!)![1]);
    const size = Number(g.querySelector('svg')!.getAttribute('height'));
    expect(ty).toBeGreaterThanOrEqual(top);
    expect(ty + size).toBeLessThanOrEqual(top + height);
    // Her span is a dashed pill in the same lane, selectable as a person.
    expect(
      svg
        .querySelector('rect[data-person-span="queen-of-sheba"]')!
        .classList.contains('item-dashed'),
    ).toBe(true);
    expect(
      svg
        .querySelector('g[data-item="person:queen-of-sheba"] rect.item-hit')!
        .getAttribute('data-select'),
    ).toBe('person:queen-of-sheba');
  });
});

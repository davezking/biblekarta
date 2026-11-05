// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { touchTarget } from '../../../lib/core/tokens';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { placeLanes } from '../geometry';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let data: ChartData;
let container: HTMLElement;
let root: Root;

beforeAll(async () => {
  data = await seedChartData();
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(store: ChartStore = createChartStore()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Chart data={data} store={store} />));
  return { svg: container.querySelector('svg.chart-svg') as SVGSVGElement, store };
}

const seg = (svg: SVGSVGElement, id: string) =>
  svg.querySelector(`g.chart-geometry g[data-reign-segment="${id}"]`)!;
const reign = (id: string) => data.tile.axes.scholarly.reigns.find((r) => r.reign_id === id)!;

describe('ReignLayer', () => {
  it('draws every reign as a segment inside the geometry group, with no text', async () => {
    const { svg } = await render();
    const ids = [...svg.querySelectorAll('g.chart-geometry [data-reign-segment]')].map((g) =>
      g.getAttribute('data-reign-segment'),
    );
    expect(ids.sort()).toEqual(data.tile.axes.scholarly.reigns.map((r) => r.reign_id).sort());
    expect(svg.querySelectorAll('g.chart-geometry text')).toHaveLength(0);
  });

  it('bounds a reign with thin non-scaling dividers at its start and end', async () => {
    const { svg } = await render();
    const ahab = reign('ahab');
    const lines = [...seg(svg, 'ahab').querySelectorAll('line.reign-divider')];
    expect(lines.map((l) => Number(l.getAttribute('x1')))).toEqual([ahab.x0, ahab.x1]);
    for (const l of lines) {
      expect(l.getAttribute('x2')).toBe(l.getAttribute('x1'));
      expect(l.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
  });

  it('leaves out the divider on the unknown side of an open reign', async () => {
    const { svg } = await render();
    // David's reign has only an end year on the scholarly axis in the seed.
    const david = reign('david');
    expect(david.open).toBe('start');
    const xs = [...seg(svg, 'david').querySelectorAll('line.reign-divider')].map((l) =>
      Number(l.getAttribute('x1')),
    );
    expect(xs).toEqual([david.x1]);
  });

  it('clips each segment to its stream’s path', async () => {
    const { svg } = await render();
    const lanes = data.index.layout!.scholarly.lanes;
    const { laneY } = placeLanes(lanes, []);
    for (const r of data.tile.axes.scholarly.reigns) {
      // The clip sits on the stream's group of segments.
      const group = seg(svg, r.reign_id).closest('g[data-reign-stream]')!;
      expect(group.getAttribute('data-reign-stream')).toBe(r.stream_id);
      const ref = /^url\(#(.+)\)$/.exec(group.getAttribute('clip-path')!)![1]!;
      const clip = svg.querySelector(`clipPath[id="${ref}"]`)!;
      const band = data.tile.axes.scholarly.bands.find((b) => b.stream_id === r.stream_id)!;
      const path = clip.querySelector('path')!;
      expect(path.getAttribute('d')).toBe(band.d);
      expect(path.getAttribute('transform')).toBe(`translate(0,${laneY.get(band.lane_id)})`);
    }
  });

  it('outlines approximate (dashed) reigns with a dashed stroke only', async () => {
    const { svg } = await render();
    const dashed = data.tile.axes.scholarly.reigns.filter((r) => r.dashed).map((r) => r.reign_id);
    expect(dashed.length).toBeGreaterThan(0);
    for (const r of data.tile.axes.scholarly.reigns) {
      const rect = seg(svg, r.reign_id).querySelector('rect.reign-fill')!;
      expect(rect.classList.contains('reign-dashed')).toBe(r.dashed);
      expect(rect.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
  });

  it('gives every reign a hit target ≥ 44 px tall that selects it on tap', async () => {
    const { svg, store } = await render();
    const hits = [...svg.querySelectorAll('rect.reign-hit')];
    expect(hits).toHaveLength(data.tile.axes.scholarly.reigns.length);
    for (const h of hits)
      expect(Number(h.getAttribute('height'))).toBeGreaterThanOrEqual(touchTarget);
    // A reign in a packed row (Elisha, among the prophets) is only a row tall, but its target isn't.
    const elisha = svg.querySelector('rect.reign-hit[data-reign="elisha"]')!;
    expect(Number(elisha.getAttribute('height'))).toBe(touchTarget);

    await act(async () => elisha.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(store.getSnapshot().selection).toEqual({ kind: 'reign', id: 'elisha' });
  });

  it('fills a polity stream’s full width, even when the polity has packed rows', async () => {
    const { svg } = await render();
    const united = data.tile.axes.scholarly.bands.find((b) => b.stream_id === 'united')!;
    // The temple event gives the United Kingdom a packed row; its reigns stay at full width.
    expect(united.kind).toBe('polity');
    expect(united.rows).toBeGreaterThan(0);
    const { laneY } = placeLanes(data.index.layout!.scholarly.lanes, []);
    const top = laneY.get(united.lane_id)! + united.cy - united.height / 2;
    const bottom = top + united.height;
    for (const id of ['david', 'solomon']) {
      const lines = [...seg(svg, id).querySelectorAll('line.reign-divider')];
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        expect(Number(l.getAttribute('y1'))).toBeCloseTo(top);
        expect(Number(l.getAttribute('y2'))).toBeCloseTo(bottom);
      }
      const fill = seg(svg, id).querySelector('rect.reign-fill')!;
      expect(Number(fill.getAttribute('height'))).toBeCloseTo(united.height);
    }
  });

  it('outlines a selected polity reign over the stream’s full width', async () => {
    const { svg, store } = await render();
    const united = data.tile.axes.scholarly.bands.find((b) => b.stream_id === 'united')!;
    const { laneY } = placeLanes(data.index.layout!.scholarly.lanes, []);
    const top = laneY.get(united.lane_id)! + united.cy - united.height / 2;
    await act(async () => store.select({ kind: 'reign', id: 'solomon' }));
    const outline = svg.querySelector('rect.chart-selection')!;
    expect(Number(outline.getAttribute('y'))).toBeCloseTo(top);
    expect(Number(outline.getAttribute('height'))).toBeCloseTo(united.height);
  });

  it('drops the reigns of a hidden lane', async () => {
    const { svg, store } = await render();
    await act(async () => store.setLaneHidden('united', true));
    expect(svg.querySelector('[data-reign-segment="ahab"]')).toBeNull();
    expect(svg.querySelector('[data-reign-segment="elisha"]')).not.toBeNull();
  });
});

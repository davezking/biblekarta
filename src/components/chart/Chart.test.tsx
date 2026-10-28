// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Chart from './Chart';
import type { ChartData } from './data/useChartData';
import { AXIS_BAND_PX, placeLanes } from './geometry';
import { seedChartData } from './seed-data.testutil';
import { createChartStore, type ChartStore } from './state';

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
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

async function render(store: ChartStore = createChartStore()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Chart data={data} store={store} />));
  return { svg: container.querySelector('svg.chart-svg') as SVGSVGElement, store };
}

const laneYOf = (svg: SVGSVGElement, id: string) => {
  const g = svg.querySelector(`g[data-lane="${id}"]`);
  if (!g) return null;
  return Number(/translate\(0,([-\d.]+)\)/.exec(g.getAttribute('transform')!)![1]);
};

describe('Chart', () => {
  it('draws the seed tile’s stream bands in lane order on the scholarly axis', async () => {
    const { svg } = await render();
    const lanes = [...svg.querySelectorAll('g.chart-geometry > g[data-lane]')].map((g) =>
      g.getAttribute('data-lane'),
    );
    expect(lanes).toEqual(['prophets', 'sidon', 'united', 'ethiopia', 'aram', 'egypt', 'assyria']);
    const paths = [...svg.querySelectorAll('path.chart-band')];
    expect(paths.map((p) => p.getAttribute('data-stream')).sort()).toEqual(
      data.tile.axes.scholarly.bands.map((b) => b.stream_id).sort(),
    );
    const israel = svg.querySelector('path[data-stream="israel"]')!;
    expect(israel.getAttribute('d')).toBe(
      data.tile.axes.scholarly.bands.find((b) => b.stream_id === 'israel')!.d,
    );
    expect(israel.getAttribute('fill')).toBe('#E2B54F');
  });

  it('keeps outlines 1 px at every zoom (non-scaling stroke)', async () => {
    const { svg } = await render();
    for (const p of svg.querySelectorAll('path.chart-band')) {
      expect(p.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      expect(p.getAttribute('stroke-width')).toBe('1');
    }
  });

  it('shifts the later lane groups up when a lane is hidden, with no re-layout', async () => {
    const { svg, store } = await render();
    const lanes = data.index.layout!.scholarly.lanes;
    const sidonH = lanes.find((l) => l.id === 'sidon')!.height;
    const before = { united: laneYOf(svg, 'united')!, egypt: laneYOf(svg, 'egypt')! };
    const prophets = laneYOf(svg, 'prophets');
    const pathBefore = svg.querySelector('path[data-stream="judah"]')!.getAttribute('d');

    await act(async () => store.setLaneHidden('sidon', true));
    expect(laneYOf(svg, 'sidon')).toBeNull();
    expect(laneYOf(svg, 'prophets')).toBe(prophets);
    expect(laneYOf(svg, 'united')).toBe(before.united - sidonH);
    expect(laneYOf(svg, 'egypt')).toBe(before.egypt - sidonH);
    expect(svg.querySelector('path[data-stream="judah"]')!.getAttribute('d')).toBe(pathBefore);
    expect(Number(svg.getAttribute('height'))).toBe(placeLanes(lanes, ['sidon']).height);
  });

  it('places the first lane under the axis band', () => {
    const { laneY, height } = placeLanes(data.index.layout!.scholarly.lanes, []);
    expect(laneY.get('prophets')).toBe(AXIS_BAND_PX);
    expect(height).toBeCloseTo(AXIS_BAND_PX + data.index.layout!.scholarly.height);
  });

  it('selects an item tapped through data-select, and outlines it in red', async () => {
    const { svg, store } = await render();
    // ReignLayer (P2-S2-T6) adds these hit targets; simulate one here.
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hit.setAttribute('data-select', 'reign:ahab');
    svg.querySelector('g.chart-geometry')!.append(hit);
    await act(async () => hit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(store.getSnapshot().selection).toEqual({ kind: 'reign', id: 'ahab' });
    const outline = svg.querySelector('g.chart-overlay rect.chart-selection')!;
    const ahab = data.tile.axes.scholarly.reigns.find((r) => r.reign_id === 'ahab')!;
    expect(Number(outline.getAttribute('x'))).toBeCloseTo(ahab.x0);
    expect(Number(outline.getAttribute('width'))).toBeCloseTo(ahab.x1 - ahab.x0);

    // A person selection outlines all of their reigns; a tap on empty space clears it.
    await act(async () => store.select({ kind: 'person', id: 'ahab' }));
    expect(svg.querySelectorAll('rect.chart-selection')).toHaveLength(1);
    await act(async () => svg.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(store.getSnapshot().selection).toBeNull();
    expect(svg.querySelectorAll('rect.chart-selection')).toHaveLength(0);
  });

  it('mounts every layer group, the toolbar and an accessible label', async () => {
    const { svg } = await render();
    expect([...svg.children].map((c) => c.getAttribute('class')).filter(Boolean)).toEqual([
      'chart-grid',
      'chart-geometry',
      'chart-labels',
      'chart-overlay',
    ]);
    expect(svg.getAttribute('aria-label')).toBeTruthy();
    expect(svg.style.touchAction === '' || svg.style.touchAction === 'pan-y').toBe(true);
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it('fetches the index and the live tile when no data is passed', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        const body = url.endsWith('index.json') ? data.index : data.tile;
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Chart />));
    await act(async () => {});
    expect(urls).toEqual(['/data/index.json', '/data/tiles/divided-kingdom.json']);
    expect(container.querySelectorAll('path.chart-band').length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});

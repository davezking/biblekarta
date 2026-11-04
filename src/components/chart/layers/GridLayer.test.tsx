// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createT } from '../../../lib/i18n';
import { x as yearToX } from '../../../lib/layout/timescale';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore } from '../state';
import { createViewportChannel } from '../viewport';
import GridLayer, { gridTicks, MIN_DECADE_GAP_PX } from './GridLayer';
import type { LayerProps } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let data: ChartData;
let container: HTMLElement;
let root: Root;

beforeAll(async () => {
  data = await seedChartData();
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const lines = (level: string) => [...container.querySelectorAll(`line.grid-${level}`)];
const bcYears = (els: Element[]) => els.map((l) => 1 - Number(l.getAttribute('data-year')));

describe('GridLayer', () => {
  it('rules every decade of the era, with stronger centuries and red half-centuries', async () => {
    // The seed era is astronomical −1009…−789, i.e. 1010–790 BC.
    await act(async () => root.render(<Chart data={data} store={createChartStore()} />));
    expect(bcYears(lines('century'))).toEqual([1000, 900, 800]);
    expect(bcYears(lines('half'))).toEqual([950, 850]);
    expect(lines('decade')).toHaveLength(23 - 3 - 2);
    expect(bcYears(lines('decade'))).toContain(1010);
    expect(bcYears(lines('decade'))).toContain(790);

    // Lines are drawn at k = 1 from timescale.ts, with a non-scaling stroke, down the whole chart.
    const cfg = data.index.timescale!;
    const height = container.querySelector('svg.chart-svg')!.getAttribute('height');
    for (const l of container.querySelectorAll('line.grid-line')) {
      const year = Number(l.getAttribute('data-year'));
      expect(Number(l.getAttribute('x1'))).toBeCloseTo(yearToX(year, 'scholarly', cfg));
      expect(l.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      expect(l.getAttribute('y2')).toBe(height);
    }
  });

  it('follows the geometry’s x-only transform, and draws half-centuries in red ink', async () => {
    await act(async () => root.render(<Chart data={data} store={createChartStore()} />));
    const svg = container.querySelector('svg.chart-svg')!;
    const grid = svg.querySelector('g.chart-grid-lines')!;
    expect(grid.getAttribute('transform')).toBe(
      svg.querySelector('g.chart-geometry')!.getAttribute('transform'),
    );
    const css = readFileSync('src/components/chart/layers/axis.css', 'utf8');
    expect(css).toMatch(/\.grid-half\s*\{[^}]*stroke:\s*var\(--ink-red\)/);
  });

  it('switches to the traditional axis’s AA decades', () => {
    const cfg = data.index.timescale!;
    const aa = gridTicks('traditional', cfg);
    expect(aa.every((tk) => tk.year % 10 === 0)).toBe(true);
    expect(aa.filter((tk) => tk.red).map((tk) => tk.year)).toEqual(
      aa.filter((tk) => tk.year % 100 === 50).map((tk) => tk.year),
    );
  });

  it('updates its transform from the viewport channel and hides crowded decades', async () => {
    const cfg = data.index.timescale!;
    let frame: (() => void) | undefined;
    const channel = createViewportChannel((cb) => (frame = cb));
    const props = {
      axis: 'scholarly',
      cfg,
      viewport: channel,
      committed: { x: 0, k: 1, width: 1200 },
      height: 400,
      t: createT('am'),
    } as unknown as LayerProps;
    let renders = 0;
    const Counted = (p: LayerProps) => {
      renders++;
      return <GridLayer {...p} />;
    };
    await act(async () =>
      root.render(
        <svg>
          <Counted {...props} />
        </svg>,
      ),
    );
    const g = container.querySelector('g.chart-grid-lines')!;
    expect(g.getAttribute('transform')).toBe('translate(0,0) scale(1,1)');
    expect(g.hasAttribute('data-decades-hidden')).toBe(false);

    const k = (MIN_DECADE_GAP_PX / (10 * cfg.pxPerYear)) * 0.9;
    channel.emit({ x: 12, k, width: 1200 });
    frame!();
    expect(g.getAttribute('transform')).toBe(`translate(12,0) scale(${k},1)`);
    expect(g.hasAttribute('data-decades-hidden')).toBe(true);
    expect(renders).toBe(1);
  });
});

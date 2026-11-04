// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lang } from '../../../lib/i18n';
import { touchTarget } from '../../../lib/core/tokens';
import { x } from '../../../lib/layout/timescale';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import { anchorX, HANDLE_PX, popoverLeft } from './AnchorLayer';

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

async function render(lang: Lang = 'am', store: ChartStore = createChartStore()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Chart data={data} store={store} lang={lang} />));
  return { svg: container.querySelector('svg.chart-svg') as SVGSVGElement, store };
}

const anchor = (svg: SVGSVGElement, id: string) =>
  svg.querySelector<SVGGElement>(`g.chart-geometry g.anchor[data-anchor="${id}"]`)!;
const popover = () => document.querySelector<HTMLElement>('.anchor-popover');
const click = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
const key = (el: Element, k: string) =>
  act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });
const pointerDown = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });

describe('AnchorLayer', () => {
  it('draws a red dashed full-height line per seed anchor, at x() of its year', async () => {
    const { svg } = await render();
    const cfg = data.index.timescale!;
    const ids = [...svg.querySelectorAll('g.anchor')].map((g) => g.getAttribute('data-anchor'));
    expect(ids.sort()).toEqual(['jehu-tribute-841', 'qarqar-853']);
    for (const a of data.index.anchors) {
      const line = anchor(svg, a.id).querySelector('line.anchor-line')!;
      const mid = (x(a.date.start, 'scholarly', cfg) + x(a.date.start + 1, 'scholarly', cfg)) / 2;
      expect(Number(line.getAttribute('x1'))).toBeCloseTo(mid, 6);
      expect(anchorX(a, cfg)).toBeCloseTo(mid, 6);
      expect(line.getAttribute('x2')).toBe(line.getAttribute('x1'));
      expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      expect(Number(line.getAttribute('y2'))).toBe(Number(svg.getAttribute('height')));
    }
    // 853 BC is astronomical −852; 841 BC is −840.
    expect(anchor(svg, 'qarqar-853').getAttribute('data-year')).toBe('-852');
    expect(anchor(svg, 'jehu-tribute-841').getAttribute('data-year')).toBe('-840');
  });

  it('gives each line a 44 px non-scaling hit target and a focusable, named button', async () => {
    const { svg } = await render();
    const g = anchor(svg, 'qarqar-853');
    const hit = g.querySelector('line.anchor-hit')!;
    expect(Number(hit.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(touchTarget);
    expect(hit.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(g.getAttribute('role')).toBe('button');
    expect(g.getAttribute('tabindex')).toBe('0');
    expect(g.getAttribute('aria-label')).toBe('ቃርቃር ጦርነት — Kurkh Monolith');
    expect(g.getAttribute('aria-expanded')).toBe('false');
    expect(svg.querySelectorAll('g.chart-geometry text')).toHaveLength(0);
  });

  it('has a 44 px handle at the top of each line, above the streams, that opens it', async () => {
    const { svg } = await render();
    const handle = svg.querySelector('g.chart-overlay line[data-anchor-handle="qarqar-853"]')!;
    expect(handle).not.toBeNull();
    expect(HANDLE_PX).toBeGreaterThanOrEqual(touchTarget);
    expect(Number(handle.getAttribute('y1'))).toBe(0);
    expect(Number(handle.getAttribute('y2'))).toBe(HANDLE_PX);
    expect(Number(handle.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(touchTarget);
    expect(handle.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    const line = anchor(svg, 'qarqar-853').querySelector('line.anchor-line')!;
    expect(handle.getAttribute('x1')).toBe(line.getAttribute('x1'));

    // Pressing the handle does not count as a tap elsewhere; the click opens the popover.
    await pointerDown(handle);
    await click(handle);
    expect(popover()!.getAttribute('data-anchor')).toBe('qarqar-853');
    await pointerDown(handle);
    await click(handle);
    expect(popover()).toBeNull();
  });

  it('opens a popover on tap with the label, the source and the confidence', async () => {
    const { svg } = await render();
    await click(anchor(svg, 'qarqar-853').querySelector('line.anchor-hit')!);
    const p = popover()!;
    expect(p.getAttribute('role')).toBe('dialog');
    expect(p.querySelector('.anchor-popover-title')!.textContent).toBe(
      'ቃርቃር ጦርነት — Kurkh Monolith',
    );
    expect(p.querySelector('.anchor-popover-confidence')!.textContent).toBe('ተዓማኒነት፦ ከፍተኛ');
    expect(anchor(svg, 'qarqar-853').getAttribute('aria-expanded')).toBe('true');
    expect(anchor(svg, 'qarqar-853').getAttribute('aria-controls')).toBe(p.id);

    // Tapping the other anchor switches to it.
    await click(anchor(svg, 'jehu-tribute-841'));
    expect(document.querySelectorAll('.anchor-popover')).toHaveLength(1);
    expect(popover()!.textContent).toContain('Black Obelisk');
    // Tapping the open anchor again closes it.
    await click(anchor(svg, 'jehu-tribute-841'));
    expect(popover()).toBeNull();
  });

  it('shows the label in the UI language', async () => {
    const { svg } = await render('en');
    await click(anchor(svg, 'jehu-tribute-841'));
    expect(popover()!.textContent).toContain("Jehu's tribute — Black Obelisk");
    expect(popover()!.textContent).toContain('Confidence: high');
  });

  it('opens with Enter or Space, and closes with Esc, returning focus', async () => {
    const { svg } = await render();
    const g = anchor(svg, 'qarqar-853');
    g.focus();
    await key(g, 'Enter');
    expect(popover()).not.toBeNull();
    await key(document.body, 'Escape');
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(g);
    await key(g, ' ');
    expect(popover()).not.toBeNull();
  });

  it('closes on a tap elsewhere, and does not clear the selection', async () => {
    const { svg, store } = await render();
    act(() => store.select({ kind: 'reign', id: 'ahab' }));
    await click(anchor(svg, 'qarqar-853'));
    expect(popover()).not.toBeNull();
    expect(store.getSnapshot().selection).toEqual({ kind: 'reign', id: 'ahab' });
    await pointerDown(document.body);
    expect(popover()).toBeNull();
  });

  it('draws nothing on the traditional axis, and closes an open popover', async () => {
    const { svg, store } = await render();
    await click(anchor(svg, 'qarqar-853'));
    expect(popover()).not.toBeNull();
    await act(async () => store.setAxis('traditional'));
    expect(svg.querySelectorAll('g.anchor, line.anchor-line, [data-anchor-handle]')).toHaveLength(
      0,
    );
    expect(popover()).toBeNull();
    // Switching back does not reopen it.
    await act(async () => store.setAxis('scholarly'));
    expect(svg.querySelectorAll('g.anchor')).toHaveLength(2);
    expect(popover()).toBeNull();
  });

  it('keeps the popover inside the chart frame', () => {
    const frame = { left: 100, width: 400 };
    expect(popoverLeft(300, 120, frame)).toBe(100 + 300 - 60);
    expect(popoverLeft(0, 120, frame)).toBe(108);
    expect(popoverLeft(400, 120, frame)).toBe(100 + 400 - 120 - 8);
  });
});

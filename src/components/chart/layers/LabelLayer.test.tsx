// @vitest-environment happy-dom
import { act, createElement, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { contrastRatio } from '../../../lib/core/contrast';
import { ink, MIN_TEXT_CONTRAST, TEXT_ON_FILL, touchTarget } from '../../../lib/core/tokens';
import { FORK_YEARS } from '../../../lib/layout/streams';
import { totalWidth, x as yearToX } from '../../../lib/layout/timescale';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import { WHEEL_END_MS, type ChartController } from '../zoom';
import { inkOn, LONG_PRESS_MS, streamInk } from './LabelLayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const cfg = () => data.index.timescale!;
const seg = (id: string) => data.tile.axes.scholarly.reigns.find((r) => r.reign_id === id)!;
const label = (svg: SVGSVGElement, id: string) =>
  svg.querySelector<SVGGElement>(`g.reign-label[data-label="${id}"]`);
const shownLabel = (svg: SVGSVGElement, id: string) => {
  const g = label(svg, id);
  return g && g.getAttribute('visibility') !== 'hidden' ? g : null;
};
const tooltip = (svg: SVGSVGElement) => svg.querySelector('g.chart-tooltip')!;
const tooltipShown = (svg: SVGSVGElement) => tooltip(svg).getAttribute('visibility') !== 'hidden';

/** Zooms to k with the reign's span centred. */
function focus(m: Mounted, id: string, k: number, width: number) {
  const r = seg(id);
  act(() => {
    m.controller.setView({ x: width / 2 - ((r.x0 + r.x1) / 2) * k, k });
    vi.advanceTimersByTime(20);
  });
}

function pointer(el: Element, type: string, init: Record<string, unknown>) {
  const all = { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0, ...init };
  const e = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(all)) {
    Object.defineProperty(e, key, { value, configurable: true });
  }
  el.dispatchEvent(e);
}

function wheel(svg: SVGSVGElement, init: WheelEventInit) {
  const all = { clientX: 500, clientY: 0, deltaX: 0, deltaY: 0, deltaMode: 0, ...init };
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...all });
  for (const [key, value] of Object.entries({ shiftKey: false, ctrlKey: false, ...all })) {
    Object.defineProperty(e, key, { value, configurable: true });
  }
  svg.dispatchEvent(e);
}

describe('LabelLayer', () => {
  it('shows only dividers for short reigns at the whole-era zoom, then names, then years', async () => {
    const m = await mount(360);
    // The whole era fits the phone's width.
    expect(m.controller.getView().k * totalWidth('scholarly', cfg())).toBeCloseTo(360);
    // Omri's 11 years are a few px wide on a phone: no label.
    expect(shownLabel(m.svg, 'omri')).toBeNull();
    expect(m.svg.querySelector('[data-reign-segment="omri"] line.reign-divider')).not.toBeNull();

    // Zoomed in on Ahab: his name and years, lettered inside the segment.
    focus(m, 'ahab', 2.5, 360);
    const ahab = shownLabel(m.svg, 'ahab')!;
    expect(ahab.getAttribute('data-mode')).toBe('full');
    expect(ahab.querySelector('.reign-name')!.textContent).toBe('አክዓብ');
    expect(ahab.querySelector('.reign-years')!.textContent).toBe('874–853 ዓ.ዓ.');
    const x = Number(ahab.querySelector('text')!.getAttribute('x'));
    const v = m.controller.getView();
    expect(x).toBeGreaterThan(v.k * seg('ahab').x0 + v.x);
    expect(x).toBeLessThan(v.k * seg('ahab').x1 + v.x);
  });

  it('centres a polity reign’s label on the stream, not on a packed row', async () => {
    const m = await mount(360);
    focus(m, 'solomon', 2.5, 360);
    const united = data.tile.axes.scholarly.bands.find((b) => b.stream_id === 'united')!;
    // The temple event gives the United Kingdom a packed row; Solomon still fills the stream.
    expect(united.rows).toBeGreaterThan(0);
    const solomon = shownLabel(m.svg, 'solomon')!;
    expect(solomon.getAttribute('data-mode')).toBe('full');
    const hit = m.svg.querySelector('rect.reign-hit[data-reign="solomon"]')!;
    const hitCy = Number(hit.getAttribute('y')) + Number(hit.getAttribute('height')) / 2;
    expect(Number(hit.getAttribute('height'))).toBeCloseTo(Math.max(united.height, touchTarget));
    const name = Number(solomon.querySelector('.reign-name')!.getAttribute('y'));
    const years = Number(solomon.querySelector('.reign-years')!.getAttribute('y'));
    expect(name).toBeLessThan(hitCy);
    expect(years).toBeGreaterThan(hitCy);
  });

  it('reveals more labels as the zoom grows, without overlap in a row', async () => {
    const m = await mount(1200);
    const counts: number[] = [];
    for (const k of [cfg().zoom.kMin, 0.5, 1, 2]) {
      act(() => {
        m.controller.setView({ x: 0, k });
        vi.advanceTimersByTime(20);
      });
      // Count the reigns on screen at the closest zoom (base x [0, 600]): the loader culls items
      // far off screen, so labels further right drop out as k grows.
      counts.push(
        [...m.svg.querySelectorAll('g.reign-label')].filter((g) => {
          const r = seg(g.getAttribute('data-label')!);
          return r.x0 < 1200 / 2 && r.x1 > 0;
        }).length,
      );
      // Labels in the same stream row never overlap (centred, estimated widths in happy-dom).
      const byGroup = new Map<string, [number, number][]>();
      for (const g of m.svg.querySelectorAll('g.reign-label')) {
        if (g.getAttribute('visibility') === 'hidden') continue;
        const r = seg(g.getAttribute('data-label')!);
        const x = Number(g.querySelector('text')!.getAttribute('x'));
        const w = [...g.querySelectorAll('text')].reduce(
          (a, t) =>
            Math.max(
              a,
              [...t.textContent!].length * 0.85 * (t.classList.contains('reign-years') ? 13 : 16),
            ),
          0,
        );
        const key = `${r.stream_id}:${r.row}`;
        const boxes = byGroup.get(key) ?? [];
        for (const [a, b] of boxes) expect(x + w / 2 <= a || x - w / 2 >= b).toBe(true);
        boxes.push([x - w / 2, x + w / 2]);
        byGroup.set(key, boxes);
      }
    }
    for (let i = 1; i < counts.length; i++)
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
    expect(counts.at(-1)).toBeGreaterThan(counts[0]!);
  });

  it('letters every label in an ink that meets the contrast pair for its fill', async () => {
    const m = await mount(1200);
    focus(m, 'ahab', 1, 1200);
    const fill = new Map(data.index.streams.map((s) => [s.id, s.fill_color.toLowerCase()]));
    const documented = (text: string, bg: string) =>
      TEXT_ON_FILL.some((p) => p.text.toLowerCase() === text && p.fill.toLowerCase() === bg);
    const texts = [
      ...[...m.svg.querySelectorAll('g.reign-label')].flatMap((g) =>
        [...g.querySelectorAll('text')].map((t) => ({
          t,
          bg: fill.get(seg(g.getAttribute('data-label')!).stream_id)!,
        })),
      ),
      ...[...m.svg.querySelectorAll('text.stream-name')].map((t) => ({
        t,
        bg: fill.get(t.getAttribute('data-stream-name')!)!,
      })),
    ];
    expect(texts.length).toBeGreaterThan(10);
    for (const { t, bg } of texts) {
      const color = t.getAttribute('fill')!.toLowerCase();
      expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(documented(color, bg)).toBe(true);
    }
    // Stream names are red ink wherever red meets contrast (DR-3).
    expect(m.svg.querySelector('text[data-stream-name="israel"]')!.getAttribute('fill')).toBe(
      ink.red,
    );
    expect(m.svg.querySelector('text[data-stream-name="judah"]')!.getAttribute('fill')).toBe(
      ink.black,
    );
  });

  it('picks a passing ink for an unknown fill', () => {
    expect(inkOn('#E2B54F', ink.brown)).toBe(ink.brown);
    expect(contrastRatio(inkOn('#3A2A1A', ink.black), '#3A2A1A')).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio(streamInk('#E0E0E0'), '#E0E0E0')).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  it('opens a tooltip with name and years on a long-press, and the release is no tap', async () => {
    const m = await mount(360);
    const hit = m.svg.querySelector('rect.reign-hit[data-reign="omri"]')!;
    act(() => pointer(hit, 'pointerdown', { clientX: 100, clientY: 300 }));
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS - 1));
    expect(tooltipShown(m.svg)).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(tooltipShown(m.svg)).toBe(true);
    expect(tooltip(m.svg).querySelector('.tooltip-name')!.textContent).toBe('ዘንበሪ');
    expect(tooltip(m.svg).querySelector('.tooltip-years')!.textContent).toBe('885–874 ዓ.ዓ.');

    act(() => pointer(hit, 'pointerup', {}));
    await act(async () => hit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(m.store.getSnapshot().selection).toBeNull();
    // A later tap selects as usual.
    act(() => void vi.advanceTimersByTime(1000));
    await act(async () => hit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(m.store.getSnapshot().selection).toEqual({ kind: 'reign', id: 'omri' });
  });

  it('does not select on the release of a long-press held for seconds', async () => {
    const m = await mount(360);
    const hit = m.svg.querySelector('rect.reign-hit[data-reign="omri"]')!;
    act(() => pointer(hit, 'pointerdown', { clientX: 100, clientY: 300 }));
    act(() => void vi.advanceTimersByTime(3000));
    expect(tooltipShown(m.svg)).toBe(true);
    act(() => pointer(hit, 'pointerup', {}));
    // On touch, the browser sends pointerleave after the lift; the tooltip stays to be read.
    act(() => pointer(m.svg, 'pointerleave', {}));
    await act(async () => hit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(m.store.getSnapshot().selection).toBeNull();
    expect(tooltipShown(m.svg)).toBe(true);
    // The next touch closes it.
    act(() => pointer(m.svg, 'pointerdown', { pointerId: 2, clientX: 10, clientY: 10 }));
    expect(tooltipShown(m.svg)).toBe(false);
  });

  it('keeps a long-press tooltip open through finger jitter, and closes it on a real pan', async () => {
    const m = await mount(360);
    focus(m, 'omri', 0.5, 360);
    expect(shownLabel(m.svg, 'omri')).toBeNull();
    const hit = m.svg.querySelector('rect.reign-hit[data-reign="omri"]')!;
    act(() => pointer(hit, 'pointerdown', { clientX: 180, clientY: 300 }));
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(tooltipShown(m.svg)).toBe(true);
    const x0 = m.controller.getView().x;
    // A held finger wobbles a couple of px: zoom.ts pans by that much.
    act(() => {
      pointer(hit, 'pointermove', { clientX: 182, clientY: 301 });
      pointer(hit, 'pointermove', { clientX: 179, clientY: 299 });
      vi.advanceTimersByTime(20);
    });
    expect(m.controller.getView().x).not.toBe(x0);
    expect(tooltipShown(m.svg)).toBe(true);
    // A real pan closes it.
    act(() => {
      pointer(hit, 'pointermove', { clientX: 240, clientY: 300 });
      vi.advanceTimersByTime(20);
    });
    expect(tooltipShown(m.svg)).toBe(false);
  });

  it('opens no hover tooltip while a mouse button is held (a drag pan)', async () => {
    const m = await mount(360);
    const hit = m.svg.querySelector('rect.reign-hit[data-reign="omri"]')!;
    act(() => pointer(hit, 'pointermove', { pointerType: 'mouse', buttons: 1, clientX: 50 }));
    expect(tooltipShown(m.svg)).toBe(false);
    act(() => pointer(hit, 'pointermove', { pointerType: 'mouse', buttons: 0, clientX: 50 }));
    expect(tooltipShown(m.svg)).toBe(true);
  });

  it('does not open on a press that moves (a pan)', async () => {
    const m = await mount(360);
    const hit = m.svg.querySelector('rect.reign-hit[data-reign="omri"]')!;
    act(() => {
      pointer(hit, 'pointerdown', { clientX: 100, clientY: 300 });
      pointer(hit, 'pointermove', { clientX: 140, clientY: 300 });
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    expect(tooltipShown(m.svg)).toBe(false);
  });

  it('reaches every reign by hover tooltip or a visible name + years', async () => {
    const m = await mount(360);
    for (const r of data.tile.axes.scholarly.reigns) {
      const hit = m.svg.querySelector(`rect.reign-hit[data-reign="${r.reign_id}"]`)!;
      act(() => pointer(hit, 'pointermove', { pointerType: 'mouse', clientX: 50, clientY: 200 }));
      const full = shownLabel(m.svg, r.reign_id)?.getAttribute('data-mode') === 'full';
      expect(full || tooltip(m.svg).getAttribute('data-reign') === r.reign_id).toBe(true);
    }
    act(() => pointer(m.svg, 'pointerleave', { pointerType: 'mouse' }));
    expect(tooltipShown(m.svg)).toBe(false);
  });

  it('re-places labels imperatively during a gesture, with one commit at its end', async () => {
    const m = await mount(1200);
    focus(m, 'ahab', 2, 1200);
    const x = () => Number(label(m.svg, 'ahab')!.querySelector('text')!.getAttribute('x'));
    const x0 = x();
    const before = m.commits.count;
    for (let i = 0; i < 10; i++) {
      act(() => {
        wheel(m.svg, { deltaY: 10, shiftKey: true });
        vi.advanceTimersByTime(20);
      });
    }
    expect(m.commits.count).toBe(before);
    expect(x()).toBeCloseTo(x0 - 100, 0);
    act(() => void vi.advanceTimersByTime(WHEEL_END_MS));
    expect(m.commits.count).toBe(before + 1);
  });

  it('letters a forked stream’s name where the fork has reached full width', async () => {
    const m = await mount(1200);
    const c = cfg();
    const v = m.controller.getView();
    const fork = data.index.streams.find((s) => s.id === 'israel')!;
    expect(fork.parent_stream_id).toBe('united');
    // The seed's Israel forks at astronomical −930 (931 BC); FORK_YEARS later it is full width.
    const full = yearToX(-930 + FORK_YEARS, 'scholarly', c);
    const israel = m.svg.querySelector('text[data-stream-name="israel"]')!;
    expect(Number(israel.getAttribute('x'))).toBeCloseTo(v.k * full + v.x + 8, 0);
  });

  it('puts the stream names in the labels group, inside the visible part of their stream', async () => {
    const m = await mount(1200);
    focus(m, 'ahab', 3, 1200);
    const israel = m.svg.querySelector('g.chart-labels text[data-stream-name="israel"]')!;
    expect(israel.textContent).toBe(data.index.streams.find((s) => s.id === 'israel')!.name_am);
    expect(israel.getAttribute('visibility')).toBeNull();
    // The Israel stream starts off screen to the left: its name is lettered at the left edge.
    expect(Number(israel.getAttribute('x'))).toBeGreaterThan(0);
    expect(Number(israel.getAttribute('x'))).toBeLessThan(20);
  });
});

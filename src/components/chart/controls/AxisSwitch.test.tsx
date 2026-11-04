// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createT } from '../../../lib/i18n';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import type { ChartController } from '../zoom';
import { unplacedCount } from './AxisSwitch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = createT('am');
let data: ChartData;
let container: HTMLElement;
let root: Root;

beforeAll(async () => {
  data = await seedChartData();
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  reduced(true);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function reduced(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (q: string) => ({ matches: on && q.includes('reduce') }) as MediaQueryList,
  );
}

async function mount() {
  const store: ChartStore = createChartStore();
  let controller: ChartController | undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<Chart data={data} store={store} onController={(c) => (controller = c)} />),
  );
  const radio = (axis: string) =>
    container.querySelector<HTMLButtonElement>(`[role="radio"][data-axis="${axis}"]`)!;
  return { store, controller: controller!, radio, svg: container.querySelector('svg')! };
}

const click = (el: HTMLElement) =>
  act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('AxisSwitch', () => {
  it('is a two-option radio group exposing the current axis', async () => {
    const m = await mount();
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe(t('axis.switch.label'));
    expect(m.radio('scholarly').textContent).toBe('ታሪካዊ ምርምር');
    expect(m.radio('traditional').textContent).toBe('ትውፊታዊ');
    expect(m.radio('scholarly').getAttribute('aria-checked')).toBe('true');
    expect(m.radio('traditional').getAttribute('aria-checked')).toBe('false');
    expect(m.radio('scholarly').tabIndex).toBe(0);
    expect(m.radio('traditional').tabIndex).toBe(-1);
  });

  it('switches to traditional, counts the undated items, keeps the selection, invents nothing', async () => {
    const m = await mount();
    await act(async () => m.store.select({ kind: 'reign', id: 'ahab' }));
    // The live region exists before the switch, empty, so the count is announced when it fills.
    const status = container.querySelector('[role="status"].axis-unplaced')!;
    expect(status.textContent).toBe('');
    await click(m.radio('traditional'));
    expect(container.querySelector('[role="status"].axis-unplaced')).toBe(status);
    expect(m.store.getSnapshot().axis).toBe('traditional');
    expect(m.radio('traditional').getAttribute('aria-checked')).toBe('true');
    const n = unplacedCount(data.index, 'traditional');
    expect(n).toBeGreaterThan(0);
    expect(status.textContent).toBe(t('axis.unplaced', { n }));
    expect(m.store.getSnapshot().selection).toEqual({ kind: 'reign', id: 'ahab' });
    // Every traditional date in the seed is TBD: no reign is drawn on this axis.
    expect(m.svg.querySelectorAll('[data-reign-segment]')).toHaveLength(0);
    expect(data.tile.axes.traditional.reigns).toHaveLength(0);
  });

  it('returns exactly to the starting view after scholarly → traditional → scholarly', async () => {
    const m = await mount();
    act(() => m.controller.setView({ x: -1200, k: 2.5 }));
    const start = m.controller.getView();
    await click(m.radio('traditional'));
    expect(m.controller.getView()).not.toEqual(start);
    await click(m.radio('scholarly'));
    expect(m.controller.getView()).toEqual(start);
  });

  it('does not restore the old view once the reader has panned on the other axis', async () => {
    const m = await mount();
    act(() => m.controller.setView({ x: -1200, k: 2.5 }));
    const start = m.controller.getView();
    await click(m.radio('traditional'));
    const there = m.controller.getView();
    act(() => m.controller.setView({ x: there.x - 300, k: there.k }));
    await click(m.radio('scholarly'));
    expect(m.controller.getView()).not.toEqual(start);
  });

  it('returns exactly to the starting view with the animation played to its end', async () => {
    reduced(false);
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'performance', 'Date'],
    });
    try {
      const m = await mount();
      act(() => m.controller.setView({ x: -1200, k: 2.5 }));
      const start = m.controller.getView();
      const spy = vi.spyOn(m.controller, 'setView');
      await click(m.radio('traditional'));
      const target = spy.mock.calls.at(-1)![0];
      expect(spy.mock.calls.at(-1)![1]).toEqual({ animate: true });
      // Mid-flight the view is still on its way…
      act(() => void vi.advanceTimersByTime(60));
      expect(m.controller.getView()).not.toEqual(target);
      // …and at the end it is exactly the target.
      act(() => void vi.advanceTimersByTime(2000));
      const landed = m.controller.getView();
      expect(Math.abs(landed.x - target.x)).toBeLessThan(1e-9);
      expect(landed.k).toBeCloseTo(target.k, 12);
      await click(m.radio('scholarly'));
      act(() => void vi.advanceTimersByTime(2000));
      expect(m.controller.getView()).toEqual(start);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves and selects with the arrow keys, keeping focus on the checked option', async () => {
    const m = await mount();
    m.radio('scholarly').focus();
    await act(async () =>
      m
        .radio('scholarly')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(m.store.getSnapshot().axis).toBe('traditional');
    expect(document.activeElement).toBe(m.radio('traditional'));
    await act(async () =>
      m
        .radio('traditional')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })),
    );
    expect(m.store.getSnapshot().axis).toBe('scholarly');
    expect(document.activeElement).toBe(m.radio('scholarly'));
  });

  it('animates the move, except under prefers-reduced-motion', async () => {
    const m = await mount();
    const spy = vi.spyOn(m.controller, 'setView');
    await click(m.radio('traditional'));
    expect(spy).toHaveBeenLastCalledWith(expect.anything(), { animate: false });
    reduced(false);
    await click(m.radio('scholarly'));
    expect(spy).toHaveBeenLastCalledWith(expect.anything(), { animate: true });
  });
});

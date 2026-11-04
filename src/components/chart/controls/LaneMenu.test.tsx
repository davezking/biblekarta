// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Chart from '../Chart';
import type { ChartData } from '../data/useChartData';
import { seedChartData } from '../seed-data.testutil';
import { createChartStore, type ChartStore } from '../state';
import { laneRows, selectionLane } from './LaneMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let data: ChartData;
let container: HTMLElement;
let root: Root | undefined;

beforeAll(async () => {
  data = await seedChartData();
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container?.remove();
  vi.restoreAllMocks();
});

async function mount(store: ChartStore = createChartStore()) {
  container = document.createElement('div');
  document.body.append(container);
  const r = (root = createRoot(container));
  await act(async () => r.render(<Chart data={data} store={store} />));
  const button = container.querySelector<HTMLButtonElement>('.lane-menu > button')!;
  const box = (lane: string) =>
    container.querySelector<HTMLInputElement>(`.lane-menu input[data-lane="${lane}"]`)!;
  const laneY = (lane: string) =>
    container.querySelector(`.chart-geometry > g[data-lane="${lane}"]`)?.getAttribute('transform');
  return { store, button, box, laneY };
}

const click = (el: Element) =>
  act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

const lanes = () => data.index.layout!.scholarly.lanes;

describe('laneRows / selectionLane', () => {
  it('lists the lanes in lane order with Amharic names', () => {
    const rows = laneRows(data.index, 'scholarly');
    expect(rows.map((r) => r.id)).toEqual(lanes().map((l) => l.id));
    expect(rows.find((r) => r.id === 'assyria')!.name).toBe(
      data.index.streams.find((s) => s.id === 'assyria')!.name_am,
    );
  });

  it("finds the lane of a selection through its item's stream", () => {
    const ahab = data.tile.reigns.find((r) => r.person_id === 'ahab')!;
    const israelLane = lanes().find((l) => l.stream_ids.includes('israel'))!.id;
    expect(selectionLane({ kind: 'reign', id: ahab.id }, data.tile, lanes())).toBe(israelLane);
    expect(selectionLane({ kind: 'person', id: 'ahab' }, data.tile, lanes())).toBe(israelLane);
    expect(selectionLane({ kind: 'person', id: 'nobody' }, data.tile, lanes())).toBeUndefined();
  });
});

describe('LaneMenu', () => {
  it('opens a checkbox list of the lanes, all shown at first', async () => {
    const m = await mount();
    expect(m.button.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.lane-menu input')).toBeNull();
    await click(m.button);
    expect(m.button.getAttribute('aria-expanded')).toBe('true');
    const boxes = [...container.querySelectorAll<HTMLInputElement>('.lane-menu input')];
    expect(boxes.map((b) => b.dataset.lane)).toEqual(lanes().map((l) => l.id));
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it('hides Assyria and shows it again, the chart shrinking and growing back', async () => {
    const m = await mount();
    const svg = container.querySelector('svg')!;
    const height = Number(svg.getAttribute('height'));
    const assyria = lanes().find((l) => l.id === 'assyria')!;
    await click(m.button);

    await click(m.box('assyria'));
    expect(m.store.getSnapshot().hiddenLanes).toEqual(['assyria']);
    expect(m.box('assyria').checked).toBe(false);
    expect(m.laneY('assyria')).toBeUndefined();
    expect(Number(svg.getAttribute('height'))).toBeCloseTo(height - assyria.height, 5);

    await click(m.box('assyria'));
    expect(m.store.getSnapshot().hiddenLanes).toEqual([]);
    expect(m.laneY('assyria')).toBeTruthy();
    expect(Number(svg.getAttribute('height'))).toBe(height);
  });

  it('moves the lanes below a hidden lane up by its height', async () => {
    const m = await mount();
    const [, middle, next] = lanes();
    const y = (lane: string) => Number(/translate\(0,([\d.]+)\)/.exec(m.laneY(lane) ?? '')?.[1]);
    const before = y(next!.id);
    await click(m.button);
    await click(m.box(middle!.id));
    expect(y(next!.id)).toBeCloseTo(before - middle!.height, 5);
    await click(m.box(middle!.id));
    expect(y(next!.id)).toBe(before);
  });

  it('clears the selection when its lane is hidden, and only then', async () => {
    const shalmaneser = data.tile.reigns.find((r) => r.stream_id === 'assyria')!;
    const m = await mount(createChartStore({ selection: { kind: 'reign', id: shalmaneser.id } }));
    await click(m.button);
    await click(m.box('egypt'));
    expect(m.store.getSnapshot().selection).not.toBeNull();
    await click(m.box('assyria'));
    expect(m.store.getSnapshot().selection).toBeNull();
  });

  it('shows every lane again with "show all"', async () => {
    const m = await mount(createChartStore({ hiddenLanes: ['assyria', 'egypt'] }));
    await click(m.button);
    const showAll = [...container.querySelectorAll('.lane-menu button')].at(-1)!;
    await click(showAll);
    expect(m.store.getSnapshot().hiddenLanes).toEqual([]);
  });

  it('closes on Escape, returning focus to the button, and on a press outside', async () => {
    const m = await mount();
    await click(m.button);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(m.button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(m.button);
    await click(m.button);
    await act(async () =>
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })),
    );
    expect(m.button.getAttribute('aria-expanded')).toBe('false');
  });
});

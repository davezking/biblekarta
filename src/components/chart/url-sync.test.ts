import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IndexFile } from '../../lib/core/datafiles';
import { x as yearToX, type Axis } from '../../lib/layout/timescale';
import { clampView } from './axis-switch';
import type { ChartData } from './data/useChartData';
import { seedChartData } from './seed-data.testutil';
import { createChartStore, type ChartStore } from './state';
import { fitView, startUrlSync, URL_SETTLE_MS, type UrlWindow } from './url-sync';
import type { ChartController, View } from './zoom';

const WIDTH = 1000;
let data: ChartData;
let index: IndexFile;

beforeAll(async () => {
  data = await seedChartData();
  index = data.index;
});
afterEach(() => {
  vi.useRealTimers();
});

/** A window whose history calls are recorded and update location, like a browser's. */
function fakeWindow(search = '') {
  const calls: { kind: 'push' | 'replace'; url: string }[] = [];
  const listeners = new Set<() => void>();
  const location = { pathname: '/', search, hash: '' };
  const entries = [`/${search}`];
  let at = 0;
  const go = (url: string) => {
    const q = url.indexOf('?');
    location.search = q < 0 ? '' : url.slice(q);
  };
  const win: UrlWindow = {
    location,
    history: {
      state: null,
      pushState: (_s, _t, url) => {
        calls.push({ kind: 'push', url: String(url) });
        entries.splice(at + 1, Infinity, String(url));
        at++;
        go(String(url));
      },
      replaceState: (_s, _t, url) => {
        calls.push({ kind: 'replace', url: String(url) });
        entries[at] = String(url);
        go(String(url));
      },
    },
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
  };
  const back = () => {
    at--;
    go(entries[at]!);
    for (const l of listeners) l();
  };
  return { win, calls, location, back };
}

/** A controller that, like zoom.ts, clamps the view and commits it to the store at once. */
function fakeController(store: ChartStore, log: string[] = []) {
  let view: View = fitView(store.getSnapshot().axis, index.timescale!, WIDTH);
  const commit = () => store.commitViewport({ ...view, width: WIDTH });
  commit();
  const controller: ChartController & {
    /** Moves the live view without committing it (mid-gesture or mid-animation). */
    live: (v: View) => void;
    /** Commits the live view (the gesture or animation ends). */
    land: () => void;
  } = {
    getView: () => view,
    setView: (v) => {
      log.push(`view:${store.getSnapshot().axis}`);
      view = clampView(v, store.getSnapshot().axis, index.timescale!, WIDTH);
      commit();
    },
    panToYear: () => {},
    focusOn: () => {},
    live: (v) => {
      view = clampView(v, store.getSnapshot().axis, index.timescale!, WIDTH);
    },
    land: commit,
  };
  return controller;
}

function start(search = '', store = createChartStore()) {
  const log: string[] = [];
  const controller = fakeController(store, log);
  const w = fakeWindow(search);
  const realSetAxis = store.setAxis;
  const realHydrate = store.hydrate;
  store.setAxis = (a) => {
    log.push(`axis:${a}`);
    realSetAxis(a);
  };
  store.hydrate = (p) => {
    log.push('hydrate');
    realHydrate(p);
  };
  const stop = startUrlSync({ store, controller, index, getTile: () => data.tile, win: w.win });
  return { store, controller, log, stop, ...w };
}

/** The centre year of the committed view on its axis. */
function centreYear(store: ChartStore): number {
  const s = store.getSnapshot();
  const v = s.committedViewport!;
  const px = (v.width / 2 - v.x) / v.k;
  const x0 = yearToX(0, s.axis, index.timescale!);
  return (px - x0) / (yearToX(1, s.axis, index.timescale!) - x0);
}

const reign = () => data.tile.reigns.find((r) => r.person_id === 'ahab')!;

describe('startUrlSync: hydrating', () => {
  it('applies the axis first, then the view, then the selection and hidden lanes', () => {
    const m = start('?y=4650&z=5&ax=t&sel=p:ahab&hide=assyria');
    expect(m.log).toEqual(['axis:traditional', 'view:traditional', 'hydrate']);
    const s = m.store.getSnapshot();
    expect(s.axis).toBe('traditional');
    expect(s.selection).toEqual({ kind: 'person', id: 'ahab' });
    expect(s.hiddenLanes).toEqual(['assyria']);
    expect(s.committedViewport!.k).toBeCloseTo(5, 5);
    expect(Math.abs(centreYear(m.store) - 4650)).toBeLessThanOrEqual(0.5);
  });

  it('leaves a fresh view alone and its URL clean', () => {
    const m = start('');
    expect(m.log).toEqual(['axis:scholarly', 'hydrate']);
    expect(m.calls).toEqual([]);
    expect(m.location.search).toBe('');
  });

  it('fits the traditional axis when the URL names only the axis', () => {
    const m = start('?ax=t');
    expect(m.log).toEqual(['axis:traditional', 'view:traditional', 'hydrate']);
    expect(m.calls).toEqual([]);
  });

  it('drops junk and unknown items, and rewrites the URL without them (no new entry)', () => {
    const m = start('?y=-850&z=5&ax=q&sel=p:nobody&hide=assyria,nowhere,Bad&foo=1');
    expect(m.store.getSnapshot().selection).toBeNull();
    expect(m.store.getSnapshot().hiddenLanes).toEqual(['assyria']);
    expect(m.calls.map((c) => c.kind)).toEqual(['replace']);
    expect(m.location.search).toBe('?y=-850&z=5&hide=assyria');
  });

  it('drops a selection whose lane is hidden', () => {
    const assyrian = data.tile.reigns.find((r) => r.stream_id === 'assyria')!;
    const m = start(`?sel=r:${assyrian.id}&hide=assyria`);
    expect(m.store.getSnapshot().selection).toBeNull();
    expect(m.store.getSnapshot().hiddenLanes).toEqual(['assyria']);
    expect(m.location.search).toBe('?hide=assyria');
    // In a lane that is shown, it stays.
    const kept = start(`?sel=r:${assyrian.id}&hide=egypt`);
    expect(kept.store.getSnapshot().selection).toEqual({ kind: 'reign', id: assyrian.id });
  });

  it('restores a reign and an event selection', () => {
    const r = reign();
    expect(start(`?sel=r:${r.id}`).store.getSnapshot().selection).toEqual({
      kind: 'reign',
      id: r.id,
    });
    const ev = data.tile.events[0]!;
    expect(start(`?sel=e:${ev.slug}`).store.getSnapshot().selection).toEqual({
      kind: 'event',
      id: ev.id,
    });
  });
});

describe('startUrlSync: round trip', () => {
  for (const axis of ['scholarly', 'traditional'] as Axis[]) {
    it(`restores the ${axis} view, selection and lanes from a copied URL`, () => {
      vi.useFakeTimers();
      const a = start();
      a.store.setAxis(axis);
      a.controller.setView({ x: -3456.7, k: 5.3456 });
      a.store.select({ kind: 'person', id: 'ahab' });
      a.store.toggleLane('assyria');
      vi.advanceTimersByTime(URL_SETTLE_MS);
      const copied = a.location.search;
      const before = a.store.getSnapshot();

      const b = start(copied);
      const after = b.store.getSnapshot();
      expect(after.axis).toBe(axis);
      expect(after.selection).toEqual(before.selection);
      expect(after.hiddenLanes).toEqual(['assyria']);
      expect(
        Math.abs(after.committedViewport!.k - before.committedViewport!.k),
      ).toBeLessThanOrEqual(0.01);
      expect(Math.abs(centreYear(b.store) - centreYear(a.store))).toBeLessThanOrEqual(0.5);
    });
  }
});

describe('startUrlSync: writing', () => {
  it('pushes an entry for a new selection and replaces for everything else', () => {
    vi.useFakeTimers();
    const m = start();
    m.store.select({ kind: 'person', id: 'ahab' });
    expect(m.calls.at(-1)).toEqual({ kind: 'push', url: '/?sel=p:ahab' });
    m.store.select({ kind: 'reign', id: reign().id });
    expect(m.calls.at(-1)!.kind).toBe('push');
    m.store.toggleLane('assyria');
    expect(m.calls.at(-1)).toEqual({ kind: 'replace', url: `/?sel=r:${reign().id}&hide=assyria` });
    m.store.setAxis('traditional');
    // The axis waits for its view to land (here at once: no animation).
    vi.advanceTimersByTime(URL_SETTLE_MS);
    expect(m.calls.at(-1)!.kind).toBe('replace');
    expect(m.location.search).toContain('ax=t');
    m.store.select(null);
    expect(m.calls.at(-1)).toEqual({ kind: 'replace', url: '/?ax=t&hide=assyria' });
    expect(m.calls.map((c) => c.kind)).toEqual(['push', 'push', 'replace', 'replace', 'replace']);
  });

  it('never writes during a gesture, and writes once at its end', () => {
    vi.useFakeTimers();
    const m = start();
    // A long inertia gesture: the store commits every 150 ms for 2 s.
    for (let i = 1; i <= 14; i++) {
      m.controller.setView({ x: -100 * i, k: 3 });
      vi.advanceTimersByTime(150);
    }
    expect(m.calls).toEqual([]);
    vi.advanceTimersByTime(URL_SETTLE_MS);
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]!.kind).toBe('replace');
    expect(m.location.search).toMatch(/^\?y=-?\d+&z=3$/);
    vi.advanceTimersByTime(10 * URL_SETTLE_MS);
    expect(m.calls).toHaveLength(1);
  });

  it('writes a selection at once, carrying the view of a gesture not yet written', () => {
    vi.useFakeTimers();
    const m = start();
    m.controller.setView({ x: -500, k: 3 });
    m.store.select({ kind: 'person', id: 'ahab' });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]!.url).toMatch(/^\/\?y=-?\d+&z=3&sel=p:ahab$/);
    vi.advanceTimersByTime(URL_SETTLE_MS);
    expect(m.calls).toHaveLength(1);
  });

  it('writes an axis switch once its view has landed, with the year on screen', () => {
    vi.useFakeTimers();
    const m = start('?y=-850&z=5');
    const writes = m.calls.length;
    // AxisSwitch: the axis first, then an animated setView that commits only when it ends.
    m.store.setAxis('traditional');
    m.controller.live({ x: -2000, k: 5 });
    vi.advanceTimersByTime(3 * URL_SETTLE_MS);
    expect(m.calls.length).toBe(writes);
    m.controller.land();
    vi.advanceTimersByTime(URL_SETTLE_MS);
    expect(m.calls.slice(writes)).toHaveLength(1);
    expect(m.location.search).toBe(`?y=${Math.round(centreYear(m.store))}&z=5&ax=t`);
  });

  it('waits out a view still moving after its last commit', () => {
    vi.useFakeTimers();
    const m = start();
    m.controller.setView({ x: -500, k: 3 });
    m.controller.live({ x: -900, k: 3 });
    vi.advanceTimersByTime(5 * URL_SETTLE_MS);
    expect(m.calls).toEqual([]);
    m.controller.land();
    vi.advanceTimersByTime(URL_SETTLE_MS);
    expect(m.calls).toHaveLength(1);
  });

  it('goes back to a clean URL at the fitted view', () => {
    vi.useFakeTimers();
    const m = start('?y=-850&z=6');
    m.controller.setView(fitView('scholarly', index.timescale!, WIDTH));
    vi.advanceTimersByTime(URL_SETTLE_MS);
    expect(m.location.search).toBe('');
  });

  it('stops writing once stopped', () => {
    vi.useFakeTimers();
    const m = start();
    m.controller.setView({ x: -500, k: 3 });
    m.stop();
    m.store.select({ kind: 'person', id: 'ahab' });
    vi.advanceTimersByTime(URL_SETTLE_MS);
    expect(m.calls).toEqual([]);
  });
});

describe('startUrlSync: Back', () => {
  it('closes the selection and keeps the view', () => {
    vi.useFakeTimers();
    const m = start();
    m.controller.setView({ x: -3000, k: 6 });
    vi.advanceTimersByTime(URL_SETTLE_MS);
    m.store.select({ kind: 'person', id: 'ahab' });
    // The reader pans with the panel open.
    m.controller.setView({ x: -3500, k: 6 });
    vi.advanceTimersByTime(URL_SETTLE_MS);
    const view = m.store.getSnapshot().committedViewport;
    const logged = m.log.length;
    const writes = m.calls.length;

    m.back();
    expect(m.store.getSnapshot().selection).toBeNull();
    expect(m.store.getSnapshot().committedViewport).toBe(view);
    expect(m.log.length).toBe(logged); // no setView
    // The entry is rewritten with the view on screen, not the one it held; nothing is pushed.
    expect(m.calls.slice(writes).map((c) => c.kind)).toEqual(['replace']);
    expect(m.location.search).not.toContain('sel=');
    expect(m.location.search).toBe(`?y=${Math.round(centreYear(m.store))}&z=6`);
  });
});

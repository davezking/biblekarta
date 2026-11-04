import { beforeAll, describe, expect, it } from 'vitest';
import type { TileFile } from '../../lib/core/datafiles';
import {
  equivalentYear,
  invert,
  totalWidth,
  type TimescaleConfig,
} from '../../lib/layout/timescale';
import { clampView, nextView, sameView, selectionSpan, type NextViewInput } from './axis-switch';
import { seedChartData } from './seed-data.testutil';

let tile: TileFile;
let cfg: TimescaleConfig;
const W = 1000;

beforeAll(async () => {
  const d = await seedChartData();
  tile = d.tile;
  cfg = d.index.timescale!;
});

const base = (over: Partial<NextViewInput>): NextViewInput => ({
  from: 'scholarly',
  to: 'traditional',
  view: { x: -2000, k: 3 },
  width: W,
  selection: null,
  tile,
  cfg,
  remembered: {},
  ...over,
});

/** The year at the centre of a view, on an axis. */
const centre = (v: { x: number; k: number }, axis: 'scholarly' | 'traditional') => {
  const at = invert((W / 2 - v.x) / v.k, axis, cfg);
  if (at.band) throw new Error('centre in the band');
  return at.year;
};

describe('nextView', () => {
  it('returns exactly the view left on an axis when nothing moved since', () => {
    const start = { x: -2000, k: 3 };
    const there = nextView(base({ view: start }));
    const remembered = { scholarly: { view: start, landed: there } };
    const back = nextView(base({ from: 'traditional', to: 'scholarly', view: there, remembered }));
    expect(back).toEqual(start);
  });

  it('forgets the remembered view once the reader has panned', () => {
    const start = { x: -2000, k: 3 };
    const there = nextView(base({ view: start }));
    const remembered = { scholarly: { view: start, landed: there } };
    const panned = { x: there.x - 40, k: there.k };
    const back = nextView(base({ from: 'traditional', to: 'scholarly', view: panned, remembered }));
    expect(sameView(back, start)).toBe(false);
    // It centres the calendar-equivalent year instead.
    const year = equivalentYear(centre(panned, 'traditional'), 'traditional', 'scholarly');
    expect(centre(back, 'scholarly')).toBeCloseTo(year, 3);
  });

  it('centres the selection when it has a placed span on the new axis, at the same zoom', () => {
    // A synthetic fixture: Ahab's reign given a traditional-axis span (test geometry only; the
    // seed's traditional dates are all TBD).
    const ahab = tile.axes.scholarly.reigns.find((r) => r.reign_id === 'ahab')!;
    const withTrad: TileFile = {
      ...tile,
      axes: {
        ...tile.axes,
        traditional: { ...tile.axes.traditional, reigns: [{ ...ahab, x0: 600, x1: 700 }] },
      },
    };
    const v = nextView(
      base({ selection: { kind: 'reign', id: 'ahab' }, tile: withTrad, view: { x: -100, k: 2 } }),
    );
    expect(v.k).toBe(2);
    expect((W / 2 - v.x) / v.k).toBeCloseTo(650);
    expect(selectionSpan({ kind: 'person', id: 'ahab' }, withTrad, 'traditional')).toEqual([
      600, 700,
    ]);
  });

  it('otherwise centres the calendar-equivalent year at the same zoom', () => {
    const view = { x: -2000, k: 3 };
    // Ahab is selected but has no traditional position (TBD in the seed): the year is used.
    const v = nextView(base({ view, selection: { kind: 'reign', id: 'ahab' } }));
    expect(selectionSpan({ kind: 'reign', id: 'ahab' }, tile, 'traditional')).toBeNull();
    expect(v.k).toBe(3);
    const want = equivalentYear(centre(view, 'scholarly'), 'scholarly', 'traditional');
    const got = centre(v, 'traditional');
    // Clamped to the traditional domain where the equivalent year falls outside it.
    const t = cfg.traditional;
    expect(got).toBeCloseTo(Math.min(Math.max(want, t.min), t.max + 1), 0);
  });

  it('returns the view unchanged for a switch to the same axis', () => {
    const view = { x: -10, k: 2 };
    expect(nextView(base({ to: 'scholarly', view }))).toBe(view);
  });
});

describe('clampView', () => {
  it('keeps k in range and the content on screen, centring narrow content', () => {
    expect(clampView({ x: 0, k: 1e6 }, 'scholarly', cfg, W).k).toBe(cfg.zoom.kMax);
    const narrow = clampView({ x: 500, k: cfg.zoom.kMin }, 'scholarly', cfg, W);
    expect(narrow.x).toBeCloseTo((W - totalWidth('scholarly', cfg) * cfg.zoom.kMin) / 2);
    const wide = clampView({ x: 100, k: 3 }, 'scholarly', cfg, W);
    expect(wide.x).toBe(0);
    const end = clampView({ x: -1e9, k: 3 }, 'scholarly', cfg, W);
    expect(end.x).toBeCloseTo(W - totalWidth('scholarly', cfg) * 3);
  });
});

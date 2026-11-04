import { describe, expect, it } from 'vitest';
import type { IndexEra } from '../../../lib/core/datafiles';
import { erasInWindow } from './window';

const era = (slug: string, order: number, s?: number, e?: number, over: Partial<IndexEra> = {}) =>
  ({
    id: slug,
    slug,
    name_am: slug,
    name_en: slug,
    order,
    certainty: 'anchored',
    status: 'live',
    minimap_weight: 1,
    x: { scholarly: null, traditional: null },
    tile: `tiles/${slug}.json`,
    ...(s !== undefined && e !== undefined
      ? { start: { scholarly: s }, end: { scholarly: e } }
      : {}),
    ...over,
  }) as IndexEra;

const index = {
  eras: [
    era('a', 1, -2000, -1501),
    era('b', 2, -1500, -1001),
    era('c', 3, -1000, -501),
    era('d', 4, -500, -1),
    era('e', 5, 0, 99),
  ],
};

describe('erasInWindow', () => {
  it('returns the eras in view plus one either side', () => {
    expect(erasInWindow(index, [-900, -800], 'scholarly')).toEqual(['b', 'c', 'd']);
    expect(erasInWindow(index, [-1200, -800], 'scholarly')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('stops at the ends of the chart', () => {
    expect(erasInWindow(index, [-1990, -1900], 'scholarly')).toEqual(['a', 'b']);
    expect(erasInWindow(index, [50, 60], 'scholarly')).toEqual(['d', 'e']);
    expect(erasInWindow(index, [-3000, 500], 'scholarly')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('counts touching boundaries as in view, and the next era as the neighbour', () => {
    // −1001 is b's last year, −1000 c's first.
    expect(erasInWindow(index, [-1001, -1001], 'scholarly')).toEqual(['a', 'b', 'c']);
    expect(erasInWindow(index, [-1000, -1000], 'scholarly')).toEqual(['b', 'c', 'd']);
  });

  it('takes the nearest era on each side of a gap with nothing in view', () => {
    const gappy = { eras: [era('a', 1, -2000, -1501), era('c', 3, -1000, -501)] };
    expect(erasInWindow(gappy, [-1300, -1200], 'scholarly')).toEqual(['a', 'c']);
  });

  it('ignores eras that are not live, have no tile, or have no years on the axis', () => {
    const mixed = {
      eras: [
        era('a', 1, -2000, -1501, { status: 'coming_soon', tile: null }),
        era('b', 2, -1500, -1001),
        era('c', 3),
        era('d', 4, -500, -1, { tile: null }),
      ],
    };
    expect(erasInWindow(mixed, [-3000, 500], 'scholarly')).toEqual(['b']);
    expect(erasInWindow(mixed, [4000, 5000], 'traditional')).toEqual([]);
  });

  it('accepts a reversed range', () => {
    expect(erasInWindow(index, [-800, -900], 'scholarly')).toEqual(['b', 'c', 'd']);
  });
});

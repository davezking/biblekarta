import { describe, expect, it } from 'vitest';
import {
  FULL_MIN_HEIGHT_PX,
  fixedWidthMeasure,
  LOD_PAD_PX,
  visibleLabels,
  type LodItem,
} from './lod';

// Each character 10 px wide in both roles, to keep the arithmetic readable.
const measure = fixedWidthMeasure(10, 10, 1);

const item = (over: Partial<LodItem>): LodItem => ({
  id: 'a',
  group: 'g',
  x0: 0,
  x1: 100,
  importance: 3,
  name: 'NAME', // 40 px
  years: 'YY–YY', // 50 px
  ...over,
});

describe('visibleLabels', () => {
  it('shows a label only when the span fits the name plus padding', () => {
    // Room at k is 100k − 2·pad; the name needs 40 px.
    const fitK = (40 + 2 * LOD_PAD_PX) / 100;
    expect(visibleLabels([item({})], fitK - 0.01, measure).size).toBe(0);
    expect(visibleLabels([item({})], fitK, measure).get('a')?.mode).toBe('name');
  });

  it('adds the years only when they fit too, and the slot is tall enough', () => {
    const yearsK = (50 + 2 * LOD_PAD_PX) / 100;
    expect(visibleLabels([item({})], yearsK - 0.01, measure).get('a')).toEqual({
      mode: 'name',
      width: 40,
    });
    expect(visibleLabels([item({})], yearsK, measure).get('a')).toEqual({
      mode: 'full',
      width: 50,
    });
    const short = item({ height: FULL_MIN_HEIGHT_PX - 1 });
    expect(visibleLabels([short], 10, measure).get('a')?.mode).toBe('name');
    expect(visibleLabels([item({ years: '' })], 10, measure).get('a')?.mode).toBe('name');
  });

  it('gives a collision to the more important label, within a group only', () => {
    // Two overlapping spans (a co-regency): their centred labels collide.
    const king = item({ id: 'king', x0: 0, x1: 100, importance: 2 });
    const coregent = item({ id: 'coregent', x0: 10, x1: 110, importance: 4 });
    const shown = visibleLabels([king, coregent], 1, measure);
    expect([...shown.keys()]).toEqual(['coregent']);
    // Equal importance: the earlier span wins.
    const tie = visibleLabels([king, { ...coregent, importance: 2 }], 1, measure);
    expect([...tie.keys()]).toEqual(['king']);
    // In different groups (another lane or row) both show.
    const apart = visibleLabels([king, { ...coregent, group: 'h' }], 1, measure);
    expect([...apart.keys()].sort()).toEqual(['coregent', 'king']);
  });

  it('reveals more labels as k grows, never fewer', () => {
    const items = [
      item({ id: 'long', x0: 0, x1: 400 }),
      item({ id: 'mid', x0: 400, x1: 520 }),
      item({ id: 'short', x0: 520, x1: 540 }),
    ];
    let last = 0;
    for (const k of [0.1, 0.2, 0.5, 1, 2, 4, 8]) {
      const n = visibleLabels(items, k, measure).size;
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(visibleLabels(items, 0.2, measure).has('short')).toBe(false);
    expect(visibleLabels(items, 4, measure).get('short')?.mode).toBe('full');
  });

  it('is deterministic whatever the input order', () => {
    const items = [
      item({ id: 'b', x0: 0, x1: 100 }),
      item({ id: 'a', x0: 0, x1: 100 }),
      item({ id: 'c', x0: 200, x1: 300 }),
    ];
    const one = visibleLabels(items, 1, measure);
    const two = visibleLabels([...items].reverse(), 1, measure);
    expect([...one.entries()].sort()).toEqual([...two.entries()].sort());
    expect(one.has('a')).toBe(true);
    expect(one.has('b')).toBe(false);
  });
});

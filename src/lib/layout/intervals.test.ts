import { describe, expect, it } from 'vitest';
import { packIntervals, rowCount, type Interval } from './intervals';

const iv = (id: string, x0: number, x1: number): Interval => ({ id, x0, x1 });

describe('packIntervals', () => {
  it('puts disjoint intervals in one row', () => {
    const rows = packIntervals([iv('a', 0, 10), iv('b', 20, 30), iv('c', 40, 50)], 4);
    expect([...rows.values()]).toEqual([0, 0, 0]);
    expect(rowCount(rows)).toBe(1);
  });

  it('stacks overlapping intervals', () => {
    const rows = packIntervals([iv('a', 0, 100), iv('b', 50, 150), iv('c', 60, 70)], 0);
    expect(Object.fromEntries(rows)).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('reuses the lowest free row', () => {
    const rows = packIntervals([iv('a', 0, 100), iv('b', 10, 20), iv('c', 30, 40)], 0);
    expect(Object.fromEntries(rows)).toEqual({ a: 0, b: 1, c: 1 });
  });

  it('lets touching intervals share a row only when the gap allows', () => {
    expect(Object.fromEntries(packIntervals([iv('a', 0, 10), iv('b', 10, 20)], 0))).toEqual({
      a: 0,
      b: 0,
    });
    expect(Object.fromEntries(packIntervals([iv('a', 0, 10), iv('b', 10, 20)], 4))).toEqual({
      a: 0,
      b: 1,
    });
    expect(Object.fromEntries(packIntervals([iv('a', 0, 10), iv('b', 14, 20)], 4))).toEqual({
      a: 0,
      b: 0,
    });
  });

  it('is stable: input order never changes the result, ties break by id', () => {
    const items = [iv('m', 0, 10), iv('b', 0, 10), iv('z', 5, 30), iv('a', 0, 10)];
    const expected = { a: 0, b: 1, m: 2, z: 3 };
    expect(Object.fromEntries(packIntervals(items, 0))).toEqual(expected);
    expect(Object.fromEntries(packIntervals([...items].reverse(), 0))).toEqual(expected);
  });

  it('uses as many rows as the deepest overlap (random check)', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let round = 0; round < 50; round++) {
      const items = Array.from({ length: 30 }, (_, i) => {
        const x0 = Math.floor(rand() * 500);
        return iv(`i${i}`, x0, x0 + 1 + Math.floor(rand() * 80));
      });
      const rows = packIntervals(items, 0);
      // No two intervals in a row overlap.
      for (const a of items) {
        for (const b of items) {
          if (a.id < b.id && rows.get(a.id) === rows.get(b.id)) {
            expect(a.x1 <= b.x0 || b.x1 <= a.x0).toBe(true);
          }
        }
      }
      // Rows used = maximum number of intervals covering one point.
      const depth = Math.max(
        ...items.map((p) => items.filter((q) => q.x0 <= p.x0 && p.x0 < q.x1).length),
      );
      expect(rowCount(rows)).toBe(depth);
    }
  });

  it('rejects duplicate ids and reversed intervals', () => {
    expect(() => packIntervals([iv('a', 0, 1), iv('a', 2, 3)], 0)).toThrow();
    expect(() => packIntervals([iv('a', 5, 1)], 0)).toThrow();
  });

  it('handles an empty list', () => {
    expect(packIntervals([], 4).size).toBe(0);
    expect(rowCount(new Map())).toBe(0);
  });
});

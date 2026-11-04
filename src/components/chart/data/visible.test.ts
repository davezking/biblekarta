import { describe, expect, it } from 'vitest';
import { visibleItems } from './visible';

const items = [
  { id: 'left', x0: 0, x1: 90 },
  { id: 'edge', x0: 90, x1: 100 },
  { id: 'in', x0: 150, x1: 160 },
  { id: 'wide', x0: -1000, x1: 1000 },
  { id: 'margin', x0: 250, x1: 260 },
  { id: 'far', x0: 400, x1: 410 },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('visibleItems', () => {
  it('keeps items intersecting the range, touching edges included', () => {
    expect(ids(visibleItems(items, [100, 200], 0))).toEqual(['edge', 'in', 'wide']);
  });

  it('widens the range by the margin on both sides', () => {
    expect(ids(visibleItems(items, [100, 200], 50))).toEqual([
      'left',
      'edge',
      'in',
      'wide',
      'margin',
    ]);
    expect(ids(visibleItems(items, [100, 200], 49))).not.toContain('margin');
  });

  it('keeps the input order and accepts a reversed range', () => {
    expect(ids(visibleItems(items, [200, 100], 50))).toEqual(
      ids(visibleItems(items, [100, 200], 50)),
    );
  });
});

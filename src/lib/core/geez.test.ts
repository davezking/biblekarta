import { describe, expect, it } from 'vitest';
import { fromGeez, GeezParseError, toGeez } from './geez';

const GOLDEN: [number, string][] = [
  [1, '፩'],
  [10, '፲'],
  [11, '፲፩'],
  [100, '፻'],
  [101, '፻፩'],
  [200, '፪፻'],
  [950, '፱፻፶'],
  [1000, '፲፻'],
  [1990, '፲፱፻፺'],
  [10000, '፼'],
  [12345, '፼፳፫፻፵፭'],
  // beyond the task's table
  [99, '፺፱'],
  [110, '፻፲'],
  [10100, '፼፻'],
  [20000, '፪፼'],
  [1_000_000, '፻፼'],
  [1_010_000, '፻፩፼'],
  [99_999_999, '፺፱፻፺፱፼፺፱፻፺፱'],
];

describe('toGeez / fromGeez', () => {
  it.each(GOLDEN)('%i ⇄ %s', (n, g) => {
    expect(toGeez(n)).toBe(g);
    expect(fromGeez(g)).toBe(n);
  });

  it('round-trips 1..20,000', () => {
    for (let n = 1; n <= 20_000; n++) {
      if (fromGeez(toGeez(n)) !== n) throw new Error(`round-trip failed for ${n}`);
    }
  });

  it.each(['', '፻፻', '፩፻', '፩፼', '፭፲', '፲፲', '፼፼', '፲1', '12', 'abc', '፻ ', '፻፡'])(
    'rejects %j',
    (s) => {
      expect(() => fromGeez(s)).toThrow(GeezParseError);
    },
  );

  it.each([0, -1, 1.5, 100_000_000, Number.NaN])('toGeez rejects %s', (n) => {
    expect(() => toGeez(n)).toThrow(RangeError);
  });
});

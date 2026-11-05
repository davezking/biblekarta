// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { cullByBand, yExtent } from './cull';
import { ALL_Y, atEdge, bandFor, nearCommitted, nearView, panShifting } from './viewport';

const NS = 'http://www.w3.org/2000/svg';
function group(extents: [number, number][]) {
  const root = document.createElementNS(NS, 'g');
  for (const [y0, y1] of extents) {
    const el = document.createElementNS(NS, 'g');
    for (const [k, v] of Object.entries(yExtent(y0, y1))) el.setAttribute(k, String(v));
    root.append(el);
  }
  return root;
}
const shown = (root: Element) =>
  [...root.children].map((el) => el.getAttribute('display') !== 'none');

describe('cullByBand', () => {
  it('hides marked elements outside the band and shows them again inside it', () => {
    const root = group([
      [0, 100],
      [500, 600],
      [2000, 2400],
    ]);
    cullByBand(root, [450, 1500]);
    expect(shown(root)).toEqual([false, true, false]);
    cullByBand(root, [1900, 3000]);
    expect(shown(root)).toEqual([false, false, true]);
    cullByBand(root, ALL_Y);
    expect(shown(root)).toEqual([true, true, true]);
  });

  it('keeps an element that straddles the band edge', () => {
    const root = group([[90, 210]]);
    cullByBand(root, [200, 400]);
    expect(shown(root)).toEqual([true]);
  });
});

describe('bandFor', () => {
  it('keeps a screen height of margin either side, and holds while the window stays inside', () => {
    const b = bandFor(ALL_Y, 1000, 800);
    expect(b).toEqual([200, 2600]);
    // Scrolled a little: unchanged (the same array, so nothing re-places).
    expect(bandFor(b, 1200, 800)).toBe(b);
    // Scrolled past the inner margin: a new band around the window.
    expect(bandFor(b, 1900, 800)).toEqual([1100, 3500]);
  });
});

describe('nearView', () => {
  it('is true within the cull margin of the screen and inside the y band', () => {
    const v = { width: 400 };
    expect(nearView(v, [0, 500], 100, 200, 10, 20)).toBe(true);
    expect(nearView(v, [0, 500], -1000, -900, 10, 20)).toBe(false);
    expect(nearView(v, [0, 500], 900, 1000, 10, 20)).toBe(false);
    expect(nearView(v, [0, 500], 100, 200, 600, 700)).toBe(false);
  });
});

describe('panShifting', () => {
  it('shifts the group on pan frames and re-places on zoom, past the limit, or when forced', () => {
    const root = document.createElementNS(NS, 'g');
    const full: number[] = [];
    const run = panShifting(root, (v) => full.push(v.x), 100);
    run({ x: 0, k: 1, width: 400 });
    expect(full).toEqual([0]);
    run({ x: -30, k: 1, width: 400 });
    expect(root.getAttribute('transform')).toBe('translate(-30,0)');
    expect(full).toEqual([0]);
    run({ x: -150, k: 1, width: 400 }); // past the limit
    expect(full).toEqual([0, -150]);
    expect(root.hasAttribute('transform')).toBe(false);
    run({ x: -160, k: 1.1, width: 400 }); // zoom
    expect(full).toEqual([0, -150, -160]);
    run({ x: -170, k: 1.1, width: 400 }, true);
    expect(full).toEqual([0, -150, -160, -170]);
  });
});

describe('nearCommitted', () => {
  const v = { x: 0, k: 1, width: 400 };
  it('keeps a screen width either side of the committed view, inside the band', () => {
    expect(nearCommitted(v, ALL_Y, -350, -300, 0, 10)).toBe(true);
    expect(nearCommitted(v, ALL_Y, -500, -450, 0, 10)).toBe(false);
    expect(nearCommitted(v, ALL_Y, 790, 900, 0, 10)).toBe(true);
    expect(nearCommitted(v, ALL_Y, 801, 900, 0, 10)).toBe(false);
    expect(nearCommitted(v, [100, 200], 0, 10, 0, 10)).toBe(false);
  });
  it('keeps everything in the band before the first commit', () => {
    expect(nearCommitted(null, ALL_Y, 1e6, 2e6, 0, 10)).toBe(true);
    expect(nearCommitted(null, [100, 200], 0, 10, 0, 10)).toBe(false);
  });
});

describe('atEdge', () => {
  it('is true for nodes across an edge, near enough to change in a pan frame', () => {
    const v = { width: 400 };
    expect(atEdge(v, 10, 300)).toBe(false); // wholly on screen
    expect(atEdge(v, -20, 30)).toBe(true);
    expect(atEdge(v, 380, 450)).toBe(true);
    expect(atEdge(v, -2000, -1900)).toBe(false); // far off screen: moves with the group
    expect(atEdge(v, 410, 420)).toBe(true); // just off screen: may come on in a pan
  });
});

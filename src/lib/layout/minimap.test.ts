import { describe, expect, it } from 'vitest';
import type { TimescaleConfig } from './timescale';
import {
  baseToMinimap,
  dragView,
  boxSpan,
  minimapLayout,
  minimapToBase,
  minimapToView,
  viewCentreToMinimap,
  viewToMinimap,
  type MinimapEra,
} from './minimap';

// Synthetic eras (not biblical data): two live spans with a coming-soon era between, and one on
// each side.
const era = (
  id: string,
  order: number,
  span: { x0: number; x1: number } | null,
  weight = 1,
  extra: Partial<MinimapEra> = {},
): MinimapEra => ({
  id,
  slug: id,
  name_am: id,
  name_en: id,
  status: span ? 'live' : 'coming_soon',
  certainty: 'approximate',
  order,
  minimap_weight: weight,
  x: { scholarly: span, traditional: span },
  ...extra,
});

const ERAS: MinimapEra[] = [
  era('d', 4, { x0: 600, x1: 1000 }),
  era('a', 1, null, 2),
  era('b', 2, { x0: 100, x1: 500 }),
  era('c', 3, null),
  era('e', 5, null),
];
// Weights 2,1,1,1,1 over 600 px: a 0–200, b 200–300, c 300–400, d 400–500, e 500–600.
const L = minimapLayout(ERAS, 600);

/** A config whose scholarly width is 1100 and traditional width 2000 at k = 1. */
const CFG: TimescaleConfig = {
  scholarly: { min: -1099, max: 0 },
  traditional: { min: 1, max: 2000 },
  pxPerYear: 1,
  band: null,
  zoom: { kMin: 0.2, kMax: 10 },
};

describe('minimapLayout', () => {
  it('lays every era out in order, sized by weight', () => {
    expect(L.boxes.map((b) => b.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(L.boxes.map((b) => [b.left, b.width])).toEqual([
      [0, 200],
      [200, 100],
      [300, 100],
      [400, 100],
      [500, 100],
    ]);
    expect(L.boxes.map((b) => b.live)).toEqual([false, true, false, true, false]);
  });

  it('defaults a missing or invalid weight to 1', () => {
    const l = minimapLayout(
      [era('a', 1, null, 0), era('b', 2, null, NaN), era('c', 3, null, 2)],
      400,
    );
    expect(l.boxes.map((b) => b.width)).toEqual([100, 100, 200]);
  });

  it('gives coming-soon eras no span, and a tradition-only era the band on scholarly', () => {
    expect(L.boxes[0]!.span).toEqual({ scholarly: null, traditional: null });
    const band = { aaMin: 1, aaMax: 100, widthPx: 288, gapPx: 24 };
    const l = minimapLayout(
      [
        era('p', 1, { x0: 0, x1: 300 }, 1, {
          certainty: 'tradition_only',
          x: { scholarly: null, traditional: { x0: 0, x1: 300 } },
        }),
      ],
      100,
      { ...CFG, band },
    );
    expect(l.boxes[0]!.span.scholarly).toEqual({ x0: 0, x1: 288 });
    expect(l.boxes[0]!.span.traditional).toEqual({ x0: 0, x1: 300 });
  });

  it('handles zero width and no eras', () => {
    expect(minimapLayout([], 300).boxes).toEqual([]);
    expect(minimapLayout(ERAS, 0).boxes.every((b) => b.width === 0)).toBe(true);
  });
});

describe('base x ↔ strip px', () => {
  it("maps a live era's span linearly onto its box", () => {
    expect(baseToMinimap(100, L, 'scholarly')).toBe(200);
    expect(baseToMinimap(300, L, 'scholarly')).toBe(250);
    expect(baseToMinimap(500, L, 'scholarly')).toBe(300);
    expect(baseToMinimap(800, L, 'scholarly')).toBe(450);
  });

  it('spans the coming-soon box between two live eras with the gap between their spans', () => {
    // 500 → 300 px, 600 → 400 px (the coming-soon box c sits between).
    expect(baseToMinimap(550, L, 'scholarly')).toBe(350);
    expect(minimapToBase(350, L, 'scholarly')).toBe(550);
  });

  it('clamps at the ends', () => {
    expect(baseToMinimap(-500, L, 'scholarly')).toBe(200);
    expect(baseToMinimap(5000, L, 'scholarly')).toBe(500);
    expect(minimapToBase(0, L, 'scholarly')).toBe(100);
    expect(minimapToBase(599, L, 'scholarly')).toBe(1000);
  });

  it('round-trips (property test over the live range)', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 500; i++) {
      const base = 100 + rand() * 900;
      expect(minimapToBase(baseToMinimap(base, L, 'scholarly'), L, 'scholarly')).toBeCloseTo(
        base,
        6,
      );
      const px = 200 + rand() * 300;
      expect(baseToMinimap(minimapToBase(px, L, 'scholarly'), L, 'scholarly')).toBeCloseTo(px, 6);
    }
  });

  it('is NaN / null with no live span on the axis', () => {
    const l = minimapLayout([era('a', 1, null)], 100);
    expect(baseToMinimap(10, l, 'scholarly')).toBeNaN();
    expect(viewToMinimap({ x: 0, k: 1, width: 100 }, l, 'scholarly')).toBeNull();
    expect(minimapToView(10, l, 'scholarly', 1, 100)).toBeNull();
  });
});

describe('view ↔ window', () => {
  it('draws the visible range as the window, at any zoom', () => {
    // k = 2, width 400: visible base 150..350 → px 212.5..262.5.
    const v = { x: -300, k: 2, width: 400 };
    expect(viewToMinimap(v, L, 'scholarly')).toEqual({ left: 212.5, width: 50 });
    // Zoomed out past the content: the window covers every live span.
    expect(viewToMinimap({ x: 100, k: 0.2, width: 400 }, L, 'scholarly')).toEqual({
      left: 200,
      width: 300,
    });
  });

  it('round-trips the view centre through the strip at the same zoom', () => {
    for (const k of [0.5, 1, 3.7]) {
      for (const centre of [150, 420, 560, 900]) {
        const width = 390;
        const view = { x: width / 2 - centre * k, k, width };
        const px = viewCentreToMinimap(view, L, 'scholarly');
        const back = minimapToView(px, L, 'scholarly', k, width)!;
        expect(back.k).toBe(k);
        expect(back.x).toBeCloseTo(view.x, 6);
      }
    }
  });

  it('drags from a centre in a margin by the distance dragged, without a jump', () => {
    // Centre at base 40, before the first live span (x0 = 100): the strip clamps it to 200 px.
    const start = { x: 200 - 40 * 2, k: 2, width: 400 };
    expect(viewCentreToMinimap(start, L, 'scholarly')).toBe(200);
    // 1 px in box b (100 px for 400 base) is 4 base x: the centre moves 40 → 44, not to 104.
    const v = dragView(start, 1, L, 'scholarly')!;
    expect((400 / 2 - v.x) / v.k).toBeCloseTo(44, 9);
    expect(v.k).toBe(2);
    // Back to the start, and further left (already at the end), the centre stays put.
    expect(dragView(start, 0, L, 'scholarly')!.x).toBe(start.x);
    expect(dragView(start, -30, L, 'scholarly')!.x).toBe(start.x);
    // Inside the spans, the drag matches mapping the strip px back.
    const mid = { x: 200 - 300 * 2, k: 2, width: 400 };
    const w = dragView(mid, 25, L, 'scholarly')!;
    expect(w.x).toBeCloseTo(minimapToView(275, L, 'scholarly', 2, 400)!.x, 9);
    expect(dragView(start, 1, minimapLayout([], 100), 'scholarly')).toBeNull();
  });

  it('clamps a drag past the ends to the first and last live span', () => {
    const v = minimapToView(-50, L, 'scholarly', 2, 400)!;
    expect((400 / 2 - v.x) / v.k).toBe(100);
    const w = minimapToView(10_000, L, 'scholarly', 2, 400)!;
    expect((400 / 2 - w.x) / w.k).toBe(1000);
  });
});

describe('an axis no live era has years on', () => {
  // Live b and d have scholarly spans only.
  const eras = ERAS.map((e) => ({ ...e, x: { scholarly: e.x.scholarly, traditional: null } }));
  const l = minimapLayout(eras, 600, CFG);

  it('maps the live boxes together onto the whole chart width', () => {
    expect(l.content).toEqual({ scholarly: 1100, traditional: 2000 });
    // Live boxes run from b's left (200) to d's right (500).
    expect(baseToMinimap(0, l, 'traditional')).toBe(200);
    expect(baseToMinimap(2000, l, 'traditional')).toBe(500);
    expect(minimapToBase(350, l, 'traditional')).toBe(1000);
    expect(viewToMinimap({ x: 0, k: 0.15, width: 300 }, l, 'traditional')).toEqual({
      left: 200,
      width: 300,
    });
  });

  it('focuses the whole chart from a live box, and nothing from a coming-soon box', () => {
    expect(boxSpan(l, l.boxes[1]!, 'traditional')).toEqual({ x0: 0, x1: 2000 });
    expect(boxSpan(l, l.boxes[0]!, 'traditional')).toBeNull();
    // An axis with real spans uses them.
    expect(boxSpan(l, l.boxes[1]!, 'scholarly')).toEqual({ x0: 100, x1: 500 });
  });

  it('has no fallback without a config', () => {
    expect(
      viewToMinimap({ x: 0, k: 1, width: 300 }, minimapLayout(eras, 600), 'traditional'),
    ).toBeNull();
  });
});

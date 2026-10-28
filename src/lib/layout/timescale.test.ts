import { describe, expect, it } from 'vitest';
import { aaToAmeteMihret, ameteMihretToGregorianRange } from '../core/dates';
import type { DateValue, Era } from '../core/schema';
import {
  buildTimescaleConfig,
  equivalentYear,
  invert,
  place,
  spanDates,
  ticks,
  totalWidth,
  x,
  xBand,
  type Axis,
  type TimescaleConfig,
} from './timescale';

const era = (fields: Partial<Era>): Era => ({
  id: 'e',
  slug: 'e',
  name_am: 'ዘመን',
  name_en: 'Era',
  certainty: 'anchored',
  status: 'live',
  order: 1,
  canon: 'shared',
  fixture: true,
  ...fields,
});

const dv = (fields: Partial<DateValue>): DateValue => ({
  certainty: 'exact',
  method: 'anchor',
  ...fields,
});

const relative = dv({ certainty: 'tradition_only', method: 'relative', relative_text_am: 'TBD' });

// Abstract test eras: their years exercise the mapping and are not dates of anything.
const testEra = era({
  id: 'test-era',
  start: { scholarly: -999, traditional: 4500 },
  end: { scholarly: -799, traditional: 4700 },
});
const bandEra = era({
  id: 'band-era',
  certainty: 'tradition_only',
  start: { traditional: 1 },
  end: { traditional: 3000 },
});

const cfg = buildTimescaleConfig([testEra]);
const banded = buildTimescaleConfig([bandEra, testEra]);
const AXES: Axis[] = ['scholarly', 'traditional'];

// Deterministic PRNG (mulberry32) for the property tests.
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

describe('buildTimescaleConfig', () => {
  it('derives domains from live eras plus a margin', () => {
    expect(cfg.scholarly.min).toBeLessThan(-999);
    expect(cfg.scholarly.max).toBeGreaterThan(-799);
    expect(cfg.traditional.min).toBeLessThan(4500);
    expect(cfg.traditional.max).toBeGreaterThan(4700);
    expect(cfg.band).toBeNull();
  });

  it('honours an explicit margin and ignores coming-soon eras', () => {
    const c = buildTimescaleConfig(
      [testEra, era({ status: 'coming_soon', start: { scholarly: -3000 } })],
      { marginYears: 10 },
    );
    expect(c.scholarly).toEqual({ min: -1009, max: -789 });
    expect(c.traditional).toEqual({ min: 4490, max: 4710 });
  });

  it('falls back to the calendar equivalent when no era gives years on an axis', () => {
    const c = buildTimescaleConfig([era({ start: { scholarly: -999 }, end: { scholarly: -799 } })]);
    expect(c.traditional.min).toBe(equivalentYear(c.scholarly.min, 'scholarly', 'traditional'));
    expect(c.traditional.max).toBe(equivalentYear(c.scholarly.max, 'scholarly', 'traditional'));
  });

  it('throws when no live era has a year', () => {
    expect(() => buildTimescaleConfig([])).toThrow();
  });

  it('sets the band from tradition-only eras with no scholarly years', () => {
    expect(banded.band).toMatchObject({ aaMin: 1, aaMax: 3000 });
    expect(banded.band!.widthPx).toBeGreaterThan(0);
    expect(banded.band!.gapPx).toBeGreaterThan(0);
    // The band era's AA years still count on the traditional axis.
    expect(banded.traditional.min).toBeLessThan(1);
  });

  it('fits the live domain in 1440 px, and in a 320 px phone, at kMin; one year is ≥ 40 px at kMax', () => {
    for (const c of [cfg, banded]) {
      for (const axis of AXES) {
        expect(totalWidth(axis, c)).toBeLessThanOrEqual(1440 + 1e-9);
        expect(totalWidth(axis, c) * c.zoom.kMin).toBeLessThanOrEqual(320 + 1e-9);
      }
      expect(c.pxPerYear * c.zoom.kMax).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(c.zoom.kMax).toBeGreaterThanOrEqual(c.zoom.kMin);
    }
  });

  it('is plain JSON (it goes into /data/index.json)', () => {
    expect(JSON.parse(JSON.stringify(banded))).toEqual(banded);
  });
});

describe('x / invert', () => {
  it('round-trips exactly on whole years, on both axes', () => {
    for (const c of [cfg, banded]) {
      for (const axis of AXES) {
        for (let y = c[axis].min; y <= c[axis].max + 1; y++) {
          expect(invert(x(y, axis, c), axis, c)).toEqual({ band: false, year: y });
        }
      }
    }
  });

  it('round-trips band years', () => {
    for (let aa = 1; aa <= 3000; aa += 7) {
      expect(invert(xBand(aa, banded), 'scholarly', banded)).toEqual({ band: true, aa });
    }
  });

  it('is linear', () => {
    const d = x(-900, 'scholarly', cfg) - x(-901, 'scholarly', cfg);
    expect(d).toBeCloseTo(cfg.pxPerYear);
    expect(x(-800, 'scholarly', cfg) - x(-900, 'scholarly', cfg)).toBeCloseTo(100 * d);
  });

  it('starts the domain at 0 without a band, after band + gap with one', () => {
    expect(x(cfg.scholarly.min, 'scholarly', cfg)).toBe(0);
    expect(x(cfg.traditional.min, 'traditional', cfg)).toBe(0);
    const b = banded.band!;
    expect(x(banded.scholarly.min, 'scholarly', banded)).toBe(b.widthPx + b.gapPx);
    expect(x(banded.traditional.min, 'traditional', banded)).toBe(0);
  });

  it('puts the band left of the earliest scholarly year, separated by the gap', () => {
    const b = banded.band!;
    expect(xBand(b.aaMin, banded)).toBe(0);
    expect(xBand(b.aaMax + 1, banded)).toBeCloseTo(b.widthPx);
    expect(x(banded.scholarly.min, 'scholarly', banded) - xBand(b.aaMax + 1, banded)).toBeCloseTo(
      b.gapPx,
    );
  });

  it('maps gap points to the nearer edge', () => {
    const b = banded.band!;
    expect(invert(b.widthPx + 1, 'scholarly', banded)).toEqual({ band: true, aa: b.aaMax + 1 });
    expect(invert(b.widthPx + b.gapPx - 1, 'scholarly', banded)).toEqual({
      band: false,
      year: banded.scholarly.min,
    });
  });

  it('xBand throws without a band', () => {
    expect(() => xBand(1, cfg)).toThrow();
  });

  it('property: order is preserved and round trips hold for random years', () => {
    const r = rng(42);
    for (let i = 0; i < 2000; i++) {
      const axis = AXES[i % 2]!;
      const c = i % 3 === 0 ? banded : cfg;
      // With a band, the scholarly axis is only defined inside its domain (left of it is the band).
      const [lo, hi] =
        c.band && axis === 'scholarly' ? [c.scholarly.min, c.scholarly.max] : [-6000, 3000];
      const a = randInt(r, lo, hi);
      const b = randInt(r, lo, hi);
      expect(invert(x(a, axis, c), axis, c)).toEqual({ band: false, year: a });
      if (a < b) expect(x(a, axis, c)).toBeLessThan(x(b, axis, c));
      const aa1 = randInt(r, 1, 3000);
      const aa2 = randInt(r, 1, 3000);
      if (aa1 < aa2) expect(xBand(aa1, banded)).toBeLessThan(xBand(aa2, banded));
      // Every band year is left of every in-domain scholarly year.
      const s = randInt(r, banded.scholarly.min, banded.scholarly.max);
      expect(xBand(aa1 + 1, banded)).toBeLessThan(x(s, 'scholarly', banded));
    }
  });
});

describe('place', () => {
  it('places a point date one year wide', () => {
    const p = place({ scholarly: dv({ start: -852 }) }, 'scholarly', cfg);
    expect(p).toEqual({
      kind: 'axis',
      x0: x(-852, 'scholarly', cfg),
      x1: x(-851, 'scholarly', cfg),
    });
  });

  it('places a span with an inclusive end year', () => {
    const p = place({ traditional: dv({ start: 4600, end: 4620 }) }, 'traditional', cfg);
    expect(p).toEqual({
      kind: 'axis',
      x0: x(4600, 'traditional', cfg),
      x1: x(4621, 'traditional', cfg),
    });
  });

  it.each([
    ['anchor', { start: -900 }],
    ['derived', { start: -900, anchor_id: 'a', anchor_value_used: -852 }],
    ['traditional', { start: -900, source_id: 's' }],
  ] as const)('places method %s on the axis', (method, fields) => {
    for (const certainty of [
      'exact',
      'approximate',
      'range',
      'disputed',
      'tradition_only',
    ] as const) {
      const p = place({ scholarly: dv({ method, certainty, ...fields }) }, 'scholarly', banded);
      expect(p.kind).toBe('axis');
    }
  });

  it('never positions a relative date', () => {
    for (const axis of AXES) {
      expect(place({ scholarly: relative, traditional: relative }, axis, banded)).toEqual({
        kind: 'unplaced',
        reason: 'relative',
      });
    }
  });

  it('leaves a missing date unplaced', () => {
    expect(place({}, 'scholarly', banded)).toEqual({ kind: 'unplaced', reason: 'missing' });
    expect(place({}, 'traditional', banded)).toEqual({ kind: 'unplaced', reason: 'missing' });
    expect(place({ scholarly: dv({ start: -900 }) }, 'traditional', banded)).toEqual({
      kind: 'unplaced',
      reason: 'missing',
    });
  });

  it('puts a tradition-only item with no scholarly date in the band', () => {
    const item = {
      traditional: dv({
        start: 1000,
        end: 1100,
        certainty: 'tradition_only',
        method: 'traditional',
        source_id: 's',
      }),
    };
    expect(place(item, 'scholarly', banded)).toEqual({
      kind: 'band',
      x0: xBand(1000, banded),
      x1: xBand(1101, banded),
    });
    // On the traditional axis it sits on the axis as usual.
    expect(place(item, 'traditional', banded)).toEqual({
      kind: 'axis',
      x0: x(1000, 'traditional', banded),
      x1: x(1101, 'traditional', banded),
    });
    expect(place(item, 'scholarly', cfg)).toEqual({ kind: 'unplaced', reason: 'no-band' });
    const late = { traditional: { ...item.traditional, start: 2990, end: 3010 } };
    expect(place(late, 'scholarly', banded)).toEqual({ kind: 'unplaced', reason: 'outside-band' });
  });

  it('bands a tradition-only item whose scholarly date has no year', () => {
    const item = {
      scholarly: relative,
      traditional: dv({
        start: 1000,
        certainty: 'tradition_only',
        method: 'traditional',
        source_id: 's',
      }),
    };
    expect(place(item, 'scholarly', banded)).toEqual({
      kind: 'band',
      x0: xBand(1000, banded),
      x1: xBand(1001, banded),
    });
    // Without a band it stays unplaced; a plain relative date still reports "relative".
    expect(place(item, 'scholarly', cfg)).toEqual({ kind: 'unplaced', reason: 'no-band' });
    expect(place({ scholarly: relative }, 'scholarly', banded)).toEqual({
      kind: 'unplaced',
      reason: 'relative',
    });
  });

  it('does not band a traditional date that is not tradition-only', () => {
    const item = { traditional: dv({ start: 1000, method: 'traditional', source_id: 's' }) };
    expect(place(item, 'scholarly', banded)).toEqual({ kind: 'unplaced', reason: 'missing' });
  });

  it('places the seed Ahab reign: unplaced traditional, 874–853 BC scholarly', () => {
    const ahab = {
      scholarly: spanDates(
        dv({ start: -873, method: 'derived', anchor_id: 'qarqar-853', anchor_value_used: -852 }),
        dv({ start: -852, method: 'derived', anchor_id: 'qarqar-853', anchor_value_used: -852 }),
      ),
      traditional: spanDates(relative, relative),
    };
    expect(place(ahab, 'traditional', cfg)).toEqual({ kind: 'unplaced', reason: 'relative' });
    expect(place(ahab, 'scholarly', cfg)).toEqual({
      kind: 'axis',
      x0: x(-873, 'scholarly', cfg),
      x1: x(-851, 'scholarly', cfg),
    });
  });
});

describe('spanDates', () => {
  it('joins two dated values into one span', () => {
    expect(spanDates(dv({ start: -873 }), dv({ start: -852 }))).toMatchObject({
      start: -873,
      end: -852,
    });
    expect(spanDates(dv({ start: 10, end: 20 }), dv({ start: 15, end: 30 }))).toMatchObject({
      start: 10,
      end: 30,
    });
  });

  it('keeps an undated side so the item stays unplaced', () => {
    expect(spanDates(dv({ start: -873 }), relative)).toBe(relative);
    expect(spanDates(relative, dv({ start: -852 }))).toBe(relative);
    expect(spanDates(undefined, undefined)).toBeUndefined();
    expect(spanDates(dv({ start: 5 }))).toEqual(dv({ start: 5 }));
  });
});

describe('ticks', () => {
  const view = (c: TimescaleConfig, axis: Axis): [number, number] => [0, totalWidth(axis, c)];
  const kFor = (c: TimescaleConfig, yearPx: number) => yearPx / c.pxPerYear;

  it('chooses century → half → decade → year as k grows', () => {
    const levels = (yearPx: number) =>
      new Set(
        ticks('scholarly', kFor(cfg, yearPx), view(cfg, 'scholarly'), cfg).map((t) => t.level),
      );
    expect(levels(0.5)).toEqual(new Set(['century']));
    expect(levels(1)).toEqual(new Set(['century', 'half']));
    expect(levels(5)).toEqual(new Set(['century', 'half', 'decade']));
    expect(levels(48)).toEqual(new Set(['century', 'half', 'decade', 'year']));
  });

  it('keeps labels ≥ 48 px apart, and picks the finest level that does', () => {
    for (const yearPx of [0.05, 0.3, 0.6, 0.96, 1, 4.8, 5, 47, 48, 60]) {
      const k = kFor(cfg, yearPx);
      const ts = ticks('traditional', k, view(cfg, 'traditional'), cfg);
      for (let i = 1; i < ts.length; i++) {
        expect((ts[i]!.x - ts[i - 1]!.x) * k).toBeGreaterThanOrEqual(48 - 1e-9);
      }
    }
    // At 4.8 px/year decades would be 48 px apart, so they are used.
    expect(
      ticks('traditional', kFor(cfg, 4.8), view(cfg, 'traditional'), cfg).some(
        (t) => t.level === 'decade',
      ),
    ).toBe(true);
    expect(
      ticks('traditional', kFor(cfg, 4.7), view(cfg, 'traditional'), cfg).some(
        (t) => t.level === 'decade',
      ),
    ).toBe(false);
  });

  it('flags half-centuries for red ink, on round BC years', () => {
    const ts = ticks('scholarly', kFor(cfg, 1), view(cfg, 'scholarly'), cfg);
    // −849 is 850 BC; −899 is 900 BC.
    expect(ts.find((t) => t.year === -849)).toMatchObject({ level: 'half', red: true });
    expect(ts.find((t) => t.year === -899)).toMatchObject({ level: 'century', red: false });
    expect(ts.every((t) => t.red === (t.level === 'half'))).toBe(true);
  });

  it('labels AD and AA years directly', () => {
    const c = buildTimescaleConfig([
      era({
        start: { scholarly: 1, traditional: 5501 },
        end: { scholarly: 200, traditional: 5700 },
      }),
    ]);
    const s = ticks('scholarly', kFor(c, 1), view(c, 'scholarly'), c).map((t) => t.year);
    expect(s).toContain(100);
    expect(s).toContain(150);
    expect(s).not.toContain(0); // year 0 is 1 BC, not a round year
    const t = ticks('traditional', kFor(c, 1), view(c, 'traditional'), c);
    expect(t.find((tk) => tk.year === 5600)).toMatchObject({ level: 'century' });
    expect(t.find((tk) => tk.year === 5650)).toMatchObject({ level: 'half', red: true });
  });

  it('only returns ticks in the visible range, and none in the band', () => {
    const k = kFor(cfg, 5);
    const ts = ticks('scholarly', k, [x(-900, 'scholarly', cfg), x(-849, 'scholarly', cfg)], cfg);
    expect(ts.map((t) => t.year)).toEqual([-899, -889, -879, -869, -859, -849]);
    expect(ticks('scholarly', 1, [0, banded.band!.widthPx], banded)).toEqual([]);
  });
});

describe('equivalentYear', () => {
  it('is the identity on the same axis', () => {
    expect(equivalentYear(-852, 'scholarly', 'scholarly')).toBe(-852);
    expect(equivalentYear(5000, 'traditional', 'traditional')).toBe(5000);
  });

  it('matches dates.ts: AA → AM → the Gregorian year covering most of it', () => {
    // AM 2018 runs September 2025 – September 2026.
    expect(equivalentYear(7518, 'traditional', 'scholarly')).toBe(2026);
    expect(equivalentYear(2026, 'scholarly', 'traditional')).toBe(7518);
    for (const aa of [1, 3388, 5500, 5501, 7518]) {
      const [, g] = ameteMihretToGregorianRange(aaToAmeteMihret(aa));
      expect(equivalentYear(aa, 'traditional', 'scholarly')).toBe(g);
    }
  });

  it('keeps the fraction of a fractional year (a view centre)', () => {
    expect(equivalentYear(2026.25, 'scholarly', 'traditional')).toBeCloseTo(7518.25);
    expect(equivalentYear(7518.5, 'traditional', 'scholarly')).toBeCloseTo(2026.5);
    expect(equivalentYear(-852.75, 'scholarly', 'traditional')).toBeCloseTo(
      equivalentYear(-853, 'scholarly', 'traditional') + 0.25,
    );
  });

  it('round-trips', () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const y = randInt(r, -6000, 3000);
      expect(
        equivalentYear(equivalentYear(y, 'scholarly', 'traditional'), 'traditional', 'scholarly'),
      ).toBe(y);
    }
  });
});

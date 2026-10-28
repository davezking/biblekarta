import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DateValue, Era, Event, Person, Reign, Stream } from '../core/schema';
import {
  END_YEARS,
  FORK_YEARS,
  LANE_PAD_PX,
  ROW_HEIGHT_PX,
  WIDTH_UNIT_PX,
  layoutStreams,
  rowY,
  widthAt,
  type AxisLayout,
  type LayoutInput,
} from './streams';
import { buildTimescaleConfig, x, type TimescaleConfig } from './timescale';

// ---------- helpers ----------

const SEED = join(__dirname, '../../../seed');
const load = <T>(collection: string): T[] =>
  readdirSync(join(SEED, collection))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(SEED, collection, f), 'utf8')) as T);

const seed: LayoutInput = {
  streams: load<Stream>('streams'),
  reigns: load<Reign>('reigns'),
  people: load<Person>('people'),
  events: load<Event>('events'),
};
const seedCfg = buildTimescaleConfig(load<Era>('eras'));

const stream = (fields: Partial<Stream> & { id: string }): Stream => ({
  slug: fields.id,
  name_am: 'ዥረት',
  name_en: 'Stream',
  kind: 'polity',
  fill_color: '#E2B54F',
  width_keyframes: [{ at: { scholarly: -1000, traditional: 4000 }, width: 2 }],
  lane_order: 1,
  canon: 'shared',
  fixture: true,
  ...fields,
});

const dv = (start: number, fields: Partial<DateValue> = {}): DateValue => ({
  start,
  certainty: 'exact',
  method: 'anchor',
  ...fields,
});

const reign = (id: string, streamId: string, s: number, e: number, approx = false): Reign => ({
  id,
  person_id: id,
  stream_id: streamId,
  start_scholarly: dv(s, approx ? { certainty: 'approximate' } : {}),
  end_scholarly: dv(e),
  coregency_flag: false,
  canon: 'shared',
  fixture: true,
});

// Abstract test chart: its years exercise the geometry and are not dates of anything.
const cfg: TimescaleConfig = buildTimescaleConfig([
  {
    id: 'test-era',
    slug: 'test-era',
    name_am: 'ዘመን',
    name_en: 'Era',
    start: { scholarly: -1000, traditional: 4000 },
    end: { scholarly: -800, traditional: 4200 },
    certainty: 'anchored',
    status: 'live',
    order: 1,
    canon: 'shared',
    fixture: true,
  },
]);

const empty = { reigns: [], people: [], events: [] };

/** All (x, y) pairs in a path made of M, C, L and Z commands. */
function points(d: string): [number, number][] {
  const nums = d
    .replace(/[MCLZ]/g, ' ')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
  return out;
}

const band = (l: AxisLayout, id: string) => {
  const b = l.bands.find((s) => s.stream_id === id);
  if (!b) throw new Error(`no band ${id}`);
  return b;
};
const lane = (l: AxisLayout, id: string) => l.lanes.find((ln) => ln.id === id)!;

function shuffle<T>(arr: readonly T[], seedN: number): T[] {
  const a = [...arr];
  let s = seedN;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ---------- tests ----------

describe('widthAt', () => {
  const kf = [
    { year: -900, width: 1 },
    { year: -880, width: 5 },
    { year: -850, width: 2 },
  ];
  it('interpolates linearly between keyframes', () => {
    expect(widthAt(kf, -900)).toBe(1);
    expect(widthAt(kf, -890)).toBe(3);
    expect(widthAt(kf, -880)).toBe(5);
    expect(widthAt(kf, -865)).toBe(3.5);
  });
  it('is constant outside the keyframes', () => {
    expect(widthAt(kf, -5000)).toBe(1);
    expect(widthAt(kf, 0)).toBe(2);
  });
  it('shows the interpolated width in the band path', () => {
    const s = stream({
      id: 'grows',
      width_keyframes: [
        { at: { scholarly: -1000 }, width: 1 },
        { at: { scholarly: -900 }, width: 5 },
      ],
    });
    const l = layoutStreams({ streams: [s], ...empty }, 'scholarly', cfg);
    const b = band(l, 'grows');
    const pts = points(b.d);
    const at = (px: number) => pts.filter(([x0]) => Math.abs(x0 - px) < 0.05).map(([, y]) => y);
    const thick = (px: number) => Math.max(...at(px)) - Math.min(...at(px));
    expect(thick(x(-1000, 'scholarly', cfg))).toBeCloseTo(WIDTH_UNIT_PX, 0);
    expect(thick(x(-900, 'scholarly', cfg))).toBeCloseTo(5 * WIDTH_UNIT_PX, 0);
    expect(b.height).toBe(5 * WIDTH_UNIT_PX);
  });
});

describe('forks and ends', () => {
  const parent = stream({
    id: 'parent',
    lane_order: 2,
    width_keyframes: [{ at: { scholarly: -1000 }, width: 4 }],
    end: { scholarly: -900 },
  });
  const upper = stream({
    id: 'upper',
    lane_order: 1,
    parent_stream_id: 'parent',
    fork: { scholarly: -900 },
    width_keyframes: [{ at: { scholarly: -900 }, width: 2 }],
  });
  const lower = stream({ ...upper, id: 'lower', slug: 'lower', lane_order: 3 });
  const l = layoutStreams({ streams: [parent, upper, lower], ...empty }, 'scholarly', cfg);

  it('puts forked children in their parent’s lane, ordered by lane_order', () => {
    expect(l.lanes).toHaveLength(1);
    expect(lane(l, 'parent').stream_ids).toEqual(['upper', 'parent', 'lower']);
    expect(band(l, 'upper').cy).toBeLessThan(band(l, 'parent').cy);
    expect(band(l, 'lower').cy).toBeGreaterThan(band(l, 'parent').cy);
  });

  it('starts each child at the parent’s centre, at the fork year', () => {
    for (const id of ['upper', 'lower']) {
      const [first] = points(band(l, id).d);
      expect(first![0]).toBeCloseTo(x(-900, 'scholarly', cfg), 1);
      expect(first![1]).toBe(band(l, 'parent').cy);
    }
  });

  it('reaches full width and its own centre FORK_YEARS after the fork', () => {
    const b = band(l, 'upper');
    const px = x(-900 + FORK_YEARS, 'scholarly', cfg);
    const ys = points(b.d)
      .filter(([x0]) => Math.abs(x0 - px) < 0.05)
      .map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(b.cy - b.height / 2, 0);
    expect(Math.max(...ys)).toBeCloseTo(b.cy + b.height / 2, 0);
  });

  it('ends a continued parent square, so its children carry it on', () => {
    const pts = points(band(l, 'parent').d);
    const end = x(-899, 'scholarly', cfg);
    const ys = pts.filter(([x0]) => Math.abs(x0 - end) < 0.05).map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4 * WIDTH_UNIT_PX, 0);
  });

  it('tapers a stream that ends on its own to a point over END_YEARS', () => {
    const lone = stream({ id: 'lone', end: { scholarly: -850 } });
    const b = band(layoutStreams({ streams: [lone], ...empty }, 'scholarly', cfg), 'lone');
    const pts = points(b.d);
    const atX = (px: number) => pts.filter(([x0]) => Math.abs(x0 - px) < 0.05).map(([, y]) => y);
    const endYs = atX(x(-849, 'scholarly', cfg));
    expect(Math.max(...endYs)).toBe(b.cy);
    expect(Math.min(...endYs)).toBe(b.cy);
    const fullYs = atX(x(-849 - END_YEARS, 'scholarly', cfg));
    expect(Math.max(...fullYs) - Math.min(...fullYs)).toBeCloseTo(b.height, 0);
    expect(b.x1).toBeCloseTo(x(-849, 'scholarly', cfg), 1);
  });

  it('gives a forked child that outlives a continuing parent its own slot', () => {
    const p = stream({ id: 'p', lane_order: 1 });
    const c = stream({
      id: 'c',
      lane_order: 2,
      parent_stream_id: 'p',
      fork: { scholarly: -900 },
      width_keyframes: [{ at: { scholarly: -900 }, width: 1 }],
    });
    const out = layoutStreams({ streams: [p, c], ...empty }, 'scholarly', cfg);
    const bp = band(out, 'p');
    const bc = band(out, 'c');
    expect(bc.cy - bc.height / 2).toBeGreaterThanOrEqual(bp.cy + bp.height / 2);
    expect(points(bc.d)[0]![1]).toBe(bp.cy);
  });
});

describe('lanes', () => {
  const seedL = layoutStreams(seed, 'scholarly', seedCfg);

  it('never lets a band leave its lane, and lanes do not overlap', () => {
    for (const l of [seedL]) {
      let y = 0;
      for (const ln of l.lanes) {
        expect(ln.y0).toBeCloseTo(y, 5);
        y += ln.height;
      }
      expect(l.height).toBeCloseTo(y, 5);
      for (const b of l.bands) {
        const ln = lane(l, b.lane_id);
        for (const [, py] of points(b.d)) {
          expect(py).toBeGreaterThanOrEqual(LANE_PAD_PX - 0.05);
          expect(py).toBeLessThanOrEqual(ln.height - LANE_PAD_PX + 0.05);
        }
      }
    }
  });

  it('collapsing lane n equals re-running the layout without it', () => {
    for (const [n, gone] of seedL.lanes.entries()) {
      const removed = new Set(gone.stream_ids);
      const without = layoutStreams(
        { ...seed, streams: seed.streams.filter((s) => !removed.has(s.id)) },
        'scholarly',
        seedCfg,
      );
      const collapsed = seedL.lanes
        .filter((ln) => ln.id !== gone.id)
        .map((ln, i) => ({ ...ln, y0: i >= n ? +(ln.y0 - gone.height).toFixed(1) : ln.y0 }));
      expect(without.lanes).toEqual(collapsed);
      expect(without.bands).toEqual(seedL.bands.filter((b) => b.lane_id !== gone.id));
      const keep = <T extends { stream_id: string | null }>(items: T[]) =>
        items.filter((it) => !removed.has(it.stream_id ?? ''));
      expect(keep(without.reigns)).toEqual(keep(seedL.reigns));
      expect(keep(without.events)).toEqual(keep(seedL.events));
    }
  });
});

describe('rows', () => {
  const ribbon = stream({
    id: 'ribbon',
    kind: 'ribbon',
    width_keyframes: [{ at: { scholarly: -1000 }, width: 1 }],
  });

  it('packs overlapping ribbon items into rows and grows the band to fit them', () => {
    const reigns = [
      reign('a', 'ribbon', -900, -860, true),
      reign('b', 'ribbon', -870, -840),
      reign('c', 'ribbon', -855, -830),
    ];
    const l = layoutStreams(
      { streams: [ribbon], reigns, people: [], events: [] },
      'scholarly',
      cfg,
    );
    expect(l.reigns.map((r) => [r.reign_id, r.row, r.dashed])).toEqual([
      ['a', 0, true],
      ['b', 1, false],
      ['c', 0, false],
    ]);
    const b = band(l, 'ribbon');
    expect(b.rows).toBe(2);
    expect(b.height).toBe(2 * ROW_HEIGHT_PX);
    expect(rowY(b, 1) - rowY(b, 0)).toBe(ROW_HEIGHT_PX);
    expect(rowY(b, 0) - ROW_HEIGHT_PX / 2).toBeCloseTo(b.cy - b.height / 2);
  });

  it('keeps polity reigns in row 0', () => {
    const polity = stream({ id: 'k' });
    const reigns = [reign('a', 'k', -900, -860), reign('b', 'k', -870, -840)];
    const l = layoutStreams(
      { streams: [polity], reigns, people: [], events: [] },
      'scholarly',
      cfg,
    );
    expect(l.reigns.map((r) => r.row)).toEqual([0, 0]);
    expect(band(l, 'k').rows).toBe(0);
  });
});

describe('unplaced', () => {
  it('counts streams with no year on the axis, and never draws them', () => {
    const s = stream({
      id: 'only-scholarly',
      width_keyframes: [{ at: { scholarly: -1000 }, width: 1 }],
    });
    const forkless = stream({
      id: 'fork-elsewhere',
      parent_stream_id: 'only-scholarly',
      fork: { scholarly: -900 },
    });
    const l = layoutStreams({ streams: [s, forkless], ...empty }, 'traditional', cfg);
    expect(l.unplaced.streams).toEqual({ count: 2, ids: ['fork-elsewhere', 'only-scholarly'] });
    expect(l.bands).toEqual([]);
    expect(l.lanes).toEqual([]);
  });

  it('lists every seed reign as unplaced on the traditional axis (TBD dates)', () => {
    const t = layoutStreams(seed, 'traditional', seedCfg);
    expect(t.reigns).toEqual([]);
    expect(t.events).toEqual([]);
    expect(t.unplaced.reigns.count).toBe(seed.reigns.length);
    expect(t.unplaced.reigns.ids).toEqual(seed.reigns.map((r) => r.id).sort());
    expect(t.unplaced.events.count).toBe(seed.events.length);
  });
});

describe('determinism', () => {
  it('gives byte-identical JSON for the same input, in any input order', () => {
    const a = JSON.stringify(layoutStreams(seed, 'scholarly', seedCfg));
    expect(JSON.stringify(layoutStreams(seed, 'scholarly', seedCfg))).toBe(a);
    for (let i = 1; i <= 5; i++) {
      const shuffled: LayoutInput = {
        streams: shuffle(seed.streams, i),
        reigns: shuffle(seed.reigns, i + 10),
        people: shuffle(seed.people, i + 20),
        events: shuffle(seed.events, i + 30),
      };
      expect(JSON.stringify(layoutStreams(shuffled, 'scholarly', seedCfg))).toBe(a);
    }
  });

  it('rounds every coordinate to 0.1 px', () => {
    const l = layoutStreams(seed, 'scholarly', seedCfg);
    const oneDp = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
    for (const b of l.bands) {
      for (const [px, py] of points(b.d)) expect(oneDp(px) && oneDp(py)).toBe(true);
      expect([b.x0, b.x1, b.cy, b.height].every(oneDp)).toBe(true);
    }
    for (const r of l.reigns) expect(oneDp(r.x0) && oneDp(r.x1)).toBe(true);
  });
});

describe('seed (scholarly)', () => {
  const l = layoutStreams(seed, 'scholarly', seedCfg);

  it('has the Board 5 lane order: ribbon on top, kingdoms grouped', () => {
    expect(l.lanes.map((ln) => ln.id)).toEqual([
      'prophets',
      'sidon',
      'united',
      'ethiopia',
      'aram',
      'egypt',
      'assyria',
    ]);
    expect(lane(l, 'united').stream_ids).toEqual(['israel', 'united', 'judah']);
    expect(band(l, 'prophets').kind).toBe('ribbon');
  });

  it('forks Israel (above) and Judah (below) from the United Kingdom at 931 BC', () => {
    const united = band(l, 'united');
    for (const id of ['israel', 'judah']) {
      const [first] = points(band(l, id).d);
      expect(first![0]).toBeCloseTo(x(-930, 'scholarly', seedCfg), 1);
      expect(first![1]).toBe(united.cy);
    }
    expect(band(l, 'israel').cy).toBeLessThan(united.cy);
    expect(band(l, 'judah').cy).toBeGreaterThan(united.cy);
  });

  it('dashes approximate spans', () => {
    expect(l.reigns.find((r) => r.reign_id === 'elisha')?.dashed).toBe(true);
    expect(l.reigns.find((r) => r.reign_id === 'ahab')?.dashed).toBe(false);
  });

  it('matches the snapshot', () => {
    expect(l).toMatchSnapshot();
  });
});

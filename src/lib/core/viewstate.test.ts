import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_STATE,
  parseViewState,
  serializeViewState,
  type ViewSelKind,
  type ViewState,
} from './viewstate';

describe('viewstate', () => {
  it('round-trips a full state', () => {
    const s: ViewState = {
      axis: 'traditional',
      y: 4650,
      z: 12.5,
      sel: { kind: 'person', slug: 'ahab' },
      hide: ['assyria', 'egypt'],
    };
    const q = serializeViewState(s);
    expect(q).toBe('?y=4650&z=12.5&ax=t&sel=p:ahab&hide=assyria,egypt');
    expect(parseViewState(q)).toEqual(s);
  });

  it('serializes the default view as a clean URL, and parses an empty one to the default', () => {
    expect(serializeViewState(DEFAULT_VIEW_STATE)).toBe('');
    expect(serializeViewState({ axis: 'scholarly', hide: [] })).toBe('');
    expect(parseViewState('')).toEqual(DEFAULT_VIEW_STATE);
    expect(parseViewState('?')).toEqual(DEFAULT_VIEW_STATE);
  });

  it('writes negative years, events and reigns', () => {
    const s: ViewState = {
      axis: 'scholarly',
      y: -850,
      sel: { kind: 'event', slug: 'battle-of-qarqar' },
      hide: [],
    };
    expect(serializeViewState(s)).toBe('?y=-850&sel=e:battle-of-qarqar');
    expect(parseViewState(serializeViewState(s))).toEqual(s);
    const r: ViewState = { axis: 'scholarly', sel: { kind: 'reign', slug: 'ahab_1' }, hide: [] };
    expect(parseViewState(serializeViewState(r))).toEqual(r);
  });

  it('accepts encoded separators', () => {
    expect(parseViewState('?sel=p%3Aahab&hide=assyria%2Cegypt')).toEqual({
      axis: 'scholarly',
      sel: { kind: 'person', slug: 'ahab' },
      hide: ['assyria', 'egypt'],
    });
  });

  it('rounds the zoom to 2 decimals and the year to an integer when writing', () => {
    expect(serializeViewState({ axis: 'scholarly', y: -850.4, z: 3.14159, hide: [] })).toBe(
      '?y=-850&z=3.14',
    );
    expect(parseViewState('?z=3.14159').z).toBe(3.14);
  });

  it('drops junk values one by one, never throwing', () => {
    const junk = [
      '?y=abc&z=-2&ax=x&sel=q:ahab&hide=,,Bad Slug,assyria',
      '?y=1e5&z=Infinity&sel=p:&hide=',
      '?y=12.5&z=0&sel=p:Ahab',
      '?sel=e:a b&sel=p:ahab',
      '?%E0%A4%A=1&y=%ZZ',
      '?y=99999999999999999999&z=1.2.3',
      '?foo=bar&ax=T',
    ];
    for (const q of junk) expect(() => parseViewState(q)).not.toThrow();
    expect(parseViewState(junk[0]!)).toEqual({ axis: 'scholarly', hide: ['assyria'] });
    expect(parseViewState(junk[1]!)).toEqual(DEFAULT_VIEW_STATE);
    expect(parseViewState(junk[2]!)).toEqual(DEFAULT_VIEW_STATE);
    // The first of a repeated parameter counts.
    expect(parseViewState(junk[3]!).sel).toBeUndefined();
    expect(parseViewState(junk[6]!)).toEqual(DEFAULT_VIEW_STATE);
  });

  it('keeps the valid values next to invalid ones', () => {
    expect(parseViewState('?y=-850&z=nope&ax=t&sel=x:1&hide=assyria,NOPE')).toEqual({
      axis: 'traditional',
      y: -850,
      hide: ['assyria'],
    });
  });

  it('drops out-of-range years (per axis) and zooms', () => {
    const limits = {
      y: { scholarly: [-1100, -500] as const, traditional: [4300, 5000] as const },
      z: [0.5, 40] as const,
    };
    expect(parseViewState('?y=-850&z=12', limits)).toEqual({
      axis: 'scholarly',
      y: -850,
      z: 12,
      hide: [],
    });
    expect(parseViewState('?y=-2000&z=100', limits)).toEqual(DEFAULT_VIEW_STATE);
    // y is checked against the parsed axis.
    expect(parseViewState('?y=-850&ax=t', limits).y).toBeUndefined();
    expect(parseViewState('?y=4650&ax=t', limits).y).toBe(4650);
  });

  it('sorts and de-duplicates hidden lanes', () => {
    expect(parseViewState('?hide=egypt,assyria,egypt').hide).toEqual(['assyria', 'egypt']);
    expect(serializeViewState({ axis: 'scholarly', hide: ['egypt', 'assyria', 'egypt'] })).toBe(
      '?hide=assyria,egypt',
    );
  });

  it('round-trips random valid states (property)', () => {
    // A small seeded PRNG (mulberry32), so a failure reproduces.
    let seed = 0x5eed;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
    const word = () =>
      Array.from(
        { length: int(1, 6) },
        () => 'abcdefghijklmnopqrstuvwxyz0123456789'[int(0, 35)],
      ).join('');
    const slug = () => Array.from({ length: int(1, 3) }, word).join('-');
    const kinds: ViewSelKind[] = ['person', 'event', 'reign'];

    for (let i = 0; i < 500; i++) {
      const s: ViewState = { axis: rand() < 0.5 ? 'scholarly' : 'traditional', hide: [] };
      if (rand() < 0.7) s.y = int(-5000, 8000);
      if (rand() < 0.7) s.z = int(1, 10000) / 100;
      if (rand() < 0.6) {
        const kind = kinds[int(0, 2)]!;
        s.sel = {
          kind,
          slug: kind === 'reign' && rand() < 0.5 ? `${word()}_${int(1, 9)}` : slug(),
        };
      }
      s.hide = [...new Set(Array.from({ length: int(0, 4) }, slug))].sort();
      expect(parseViewState(serializeViewState(s))).toEqual(s);
    }
  });
});

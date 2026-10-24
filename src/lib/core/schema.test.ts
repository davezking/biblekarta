import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  Anchor,
  Book,
  COLLECTIONS,
  DateValue,
  Era,
  Event,
  loadBooks,
  Person,
  Reign,
  Relationship,
  ScriptureRef,
  Source,
  Stream,
  YearPair,
} from './schema';
import anchor from '../../build/__fixtures__/validate/good/anchors/test-anchor.json';
import era from '../../build/__fixtures__/validate/good/eras/test-era.json';
import event from '../../build/__fixtures__/validate/good/events/test-event.json';
import person from '../../build/__fixtures__/validate/good/people/test-king.json';
import reign from '../../build/__fixtures__/validate/good/reigns/test-king-reign.json';
import relationship from '../../build/__fixtures__/validate/good/relationships/test-rel.json';
import source from '../../build/__fixtures__/validate/good/sources/test-source.json';
import stream from '../../build/__fixtures__/validate/good/streams/test-kingdom.json';

/** The issues of a failed parse, as "path: message" strings. */
function issues(schema: z.ZodType, value: unknown): string[] {
  const r = schema.safeParse(value);
  if (r.success) return [];
  return r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

const book = { id: 'gen', name_am: 'ኦሪት ዘፍጥረት', name_en: 'Genesis', testament: 'ot', order_66: 1 };

describe('entities: one valid and one invalid example each', () => {
  const cases: [string, z.ZodType, unknown, unknown, string][] = [
    ['Stream', Stream, stream, { ...stream, fill_color: 'green' }, 'fill_color'],
    [
      'Era',
      Era,
      era,
      { ...era, start: undefined },
      'start: start is required when status is "live"',
    ],
    ['Person', Person, person, { ...person, importance: 6 }, 'importance'],
    ['Reign', Reign, reign, { ...reign, coregency_flag: undefined }, 'coregency_flag'],
    ['Event', Event, event, { ...event, type: 'moment' }, 'type'],
    ['Relationship', Relationship, relationship, { ...relationship, type: 'friend' }, 'type'],
    ['Anchor', Anchor, anchor, { ...anchor, date: { start: -800, end: -900 } }, 'date.end'],
    ['Source', Source, source, { ...source, kind: 'rumour' }, 'kind'],
    ['Book', Book, book, { ...book, testament: 'apocrypha' }, 'testament'],
    ['YearPair', YearPair, { scholarly: -931 }, {}, 'needs traditional, scholarly or both'],
    [
      'ScriptureRef',
      ScriptureRef,
      { book_id: 'gen', chapter: 1, verse_start: 3, verse_end: 5 },
      { book_id: 'gen', chapter: 1, verse_start: 5, verse_end: 3 },
      'verse_end',
    ],
  ];

  it.each(cases)('%s', (_name, schema, valid, invalid, expected) => {
    expect(issues(schema, valid)).toEqual([]);
    const errs = issues(schema, invalid);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join('\n')).toContain(expected);
  });

  it('defaults canon to "shared" and accepts fixture', () => {
    expect(Source.parse({ id: 's', citation: 'c', kind: 'tradition' }).canon).toBe('shared');
    expect(Source.parse({ ...source, canon: 'ethiopian_81' }).canon).toBe('ethiopian_81');
    expect(issues(Source, { ...source, canon: 'other' })).not.toEqual([]);
  });

  it('rejects unknown fields', () => {
    expect(issues(Source, { ...source, citaton: 'typo' }).join()).toContain('citaton');
  });

  it('COLLECTIONS covers every content folder, without books', () => {
    expect(Object.keys(COLLECTIONS).sort()).toEqual([
      'anchors',
      'eras',
      'events',
      'people',
      'reigns',
      'relationships',
      'sources',
      'streams',
    ]);
  });
});

describe('DateValue rules', () => {
  const base = { certainty: 'exact' } as const;

  it('anchor ⇒ start', () => {
    expect(issues(DateValue, { ...base, method: 'anchor', start: -853 })).toEqual([]);
    expect(issues(DateValue, { ...base, method: 'anchor' })).toEqual([
      'start: start is required when method is "anchor"',
    ]);
  });

  it('derived ⇒ anchor_id and anchor_value_used', () => {
    const ok = { ...base, method: 'derived', start: -900, anchor_id: 'a', anchor_value_used: -853 };
    expect(issues(DateValue, ok)).toEqual([]);
    expect(issues(DateValue, { ...ok, anchor_id: undefined })).toEqual([
      'anchor_id: anchor_id is required when method is "derived"',
    ]);
    expect(issues(DateValue, { ...ok, anchor_value_used: undefined })).toEqual([
      'anchor_value_used: anchor_value_used is required when method is "derived"',
    ]);
  });

  it('traditional ⇒ source_id', () => {
    const ok = { ...base, method: 'traditional', start: 4500, source_id: 's' };
    expect(issues(DateValue, ok)).toEqual([]);
    expect(issues(DateValue, { ...ok, source_id: undefined })).toEqual([
      'source_id: source_id is required when method is "traditional"',
    ]);
  });

  it('relative ⇒ relative_text_am and no start', () => {
    const ok = { certainty: 'tradition_only', method: 'relative', relative_text_am: 'TBD' };
    expect(issues(DateValue, ok)).toEqual([]);
    expect(issues(DateValue, { ...ok, relative_text_am: undefined })).toEqual([
      'relative_text_am: relative_text_am is required when method is "relative"',
    ]);
    expect(issues(DateValue, { ...ok, start: 100 })).toEqual([
      'start: start must be omitted when method is "relative" (no calendar year is shown)',
    ]);
  });

  it('end ≥ start, integers only', () => {
    expect(issues(DateValue, { ...base, method: 'anchor', start: -853, end: -900 })).toEqual([
      'end: end (-900) must be ≥ start (-853)',
    ]);
    expect(issues(DateValue, { ...base, method: 'anchor', start: 1.5 }).join()).toContain('start');
  });
});

describe('loadBooks', () => {
  it('falls back to scripture-fixtures', async () => {
    const books = await loadBooks('does-not-exist');
    expect(books).toHaveLength(66);
    expect(books.find((b) => b.id === 'mal')?.order_66).toBe(39);
  });
});

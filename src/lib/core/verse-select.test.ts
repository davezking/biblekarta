import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { selectVerses, type StoredBook, type StoredVerse } from './verse-select';

// The non-scriptural fixture book only (scripture-fixtures/README.md): never Bible text.
const fixture = JSON.parse(
  readFileSync('scripture-fixtures/books/fixture.json', 'utf8'),
) as StoredBook & { chapters: { n: number; verses: StoredVerse[] }[] };
const ch1 = fixture.chapters.find((c) => c.n === 1)!.verses;

/** A book whose chapter 3 stores verses 14–15 as one range, built from fixture text. */
const withRange: StoredBook = {
  book: 'fixture',
  chapters: [
    {
      n: 3,
      verses: [
        { n: 13, t: ch1[0]!.t },
        { n: 14, to: 15, t: ch1[1]!.t },
        { n: 16, t: ch1[2]!.t },
      ],
    },
  ],
};

describe('selectVerses', () => {
  it('a single verse, the stored object itself', () => {
    const r = selectVerses(fixture, { chapter: 1, verse_start: 2 });
    expect(r.verses).toHaveLength(1);
    expect(r.verses[0]).toBe(ch1[1]); // same object: nothing copied or changed
    expect(r.missing).toEqual([]);
  });

  it('a range of verses, in book order', () => {
    const r = selectVerses(fixture, { chapter: 1, verse_start: 2, verse_end: 4 });
    expect(r.verses).toEqual([ch1[1], ch1[2], ch1[3]]);
    expect(r.missing).toEqual([]);
  });

  it('a verse inside a stored range returns that range once', () => {
    for (const verse_start of [14, 15]) {
      const r = selectVerses(withRange, { chapter: 3, verse_start });
      expect(r.verses.map((v) => [v.n, v.to])).toEqual([[14, 15]]);
      expect(r.missing).toEqual([]);
    }
    const both = selectVerses(withRange, { chapter: 3, verse_start: 14, verse_end: 16 });
    expect(both.verses.map((v) => v.n)).toEqual([14, 16]);
    const across = selectVerses(withRange, { chapter: 3, verse_start: 13, verse_end: 14 });
    expect(across.verses.map((v) => v.n)).toEqual([13, 14]);
  });

  it('lists the numbers the book does not have', () => {
    expect(selectVerses(fixture, { chapter: 1, verse_start: 9 })).toEqual({
      verses: [],
      missing: [9],
    });
    const part = selectVerses(fixture, { chapter: 1, verse_start: 3, verse_end: 6 });
    expect(part.verses.map((v) => v.n)).toEqual([3, 4]);
    expect(part.missing).toEqual([5, 6]);
    expect(selectVerses(fixture, { chapter: 99, verse_start: 1, verse_end: 2 }).missing).toEqual([
      1, 2,
    ]);
  });

  it('never modifies the book', () => {
    const before = JSON.stringify(fixture);
    selectVerses(fixture, { chapter: 1, verse_start: 1, verse_end: 4 });
    selectVerses(withRange, { chapter: 3, verse_start: 15 });
    expect(JSON.stringify(fixture)).toBe(before);
  });
});

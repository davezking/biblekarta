import { describe, expect, it } from 'vitest';
import { formatRef, parseRefKey } from './refs';

const books = [
  {
    id: '1ki',
    name_am: 'መጽሐፈ ነገሥት ቀዳማዊ',
    name_en: '1 Kings',
    abbr_am: '፩ነገ',
    testament: 'ot',
    order_66: 11,
  },
  { id: 'heb', name_am: 'ወደ ዕብራውያን', name_en: 'Hebrews', testament: 'nt', order_66: 58 },
];

describe('formatRef', () => {
  it("long form: scan name, chapter ፥ verse in Ge'ez numerals", () => {
    expect(formatRef({ book_id: '1ki', chapter: 16, verse_start: 29 }, books)).toBe(
      'መጽሐፈ ነገሥት ቀዳማዊ ፲፮፥፳፱',
    );
  });

  it('short form uses abbr_am, else the scan name', () => {
    const ref = { book_id: '1ki', chapter: 16, verse_start: 29 };
    expect(formatRef(ref, books, { short: true })).toBe('፩ነገ ፲፮፥፳፱');
    expect(formatRef({ book_id: 'heb', chapter: 2, verse_start: 14 }, books, { short: true })).toBe(
      'ወደ ዕብራውያን ፪፥፲፬',
    );
  });

  it('joins a range with –, and accepts a Map', () => {
    const index = new Map(books.map((b) => [b.id, b]));
    expect(formatRef({ book_id: 'heb', chapter: 2, verse_start: 14, verse_end: 15 }, index)).toBe(
      'ወደ ዕብራውያን ፪፥፲፬–፲፭',
    );
    expect(formatRef({ book_id: 'heb', chapter: 2, verse_start: 14, verse_end: 14 }, index)).toBe(
      'ወደ ዕብራውያን ፪፥፲፬',
    );
  });

  it('throws on an unknown book', () => {
    expect(() => formatRef({ book_id: 'xyz', chapter: 1, verse_start: 1 }, books)).toThrow(
      /unknown/,
    );
  });
});

describe('parseRefKey', () => {
  it('parses a single verse and a range', () => {
    expect(parseRefKey('1ki.16.29')).toEqual({ book_id: '1ki', chapter: 16, verse_start: 29 });
    expect(parseRefKey('heb.2.14-15')).toEqual({
      book_id: 'heb',
      chapter: 2,
      verse_start: 14,
      verse_end: 15,
    });
  });

  it.each(['1ki.16', '1ki.0.1', '1ki.16.x', '1KI.16.29', 'heb.2.15-14', ''])('rejects %j', (k) => {
    expect(() => parseRefKey(k)).toThrow();
  });
});

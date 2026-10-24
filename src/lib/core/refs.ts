// Scripture references, always in the scan's numbering. Displayed as "<book> <ch>፥<v>" with
// Ge'ez numerals and ranges joined by – (e.g. ዕብ ፪፥፲፬–፲፭). Keys look like "1ki.16.29" or
// "1ki.16.29-31".
import { toGeez } from './geez';
import type { Book, ScriptureRef } from './schema';

type RefBook = Pick<Book, 'id' | 'name_am' | 'abbr_am'>;

export function formatRef(
  ref: ScriptureRef,
  books: Map<string, RefBook> | RefBook[],
  { short = false }: { short?: boolean } = {},
): string {
  const index = Array.isArray(books) ? new Map(books.map((b) => [b.id, b])) : books;
  const book = index.get(ref.book_id);
  if (!book) throw new Error(`formatRef: unknown book "${ref.book_id}"`);
  const name = short ? book.abbr_am || book.name_am : book.name_am;
  const end =
    ref.verse_end !== undefined && ref.verse_end !== ref.verse_start
      ? `–${toGeez(ref.verse_end)}`
      : '';
  return `${name} ${toGeez(ref.chapter)}፥${toGeez(ref.verse_start)}${end}`;
}

const KEY = /^([a-z0-9]+)\.([1-9]\d*)\.([1-9]\d*)(?:-([1-9]\d*))?$/;

/** "1ki.16.29" → {book_id, chapter, verse_start}; "1ki.16.29-31" also sets verse_end. */
export function parseRefKey(key: string): ScriptureRef {
  const m = KEY.exec(key);
  if (!m) throw new Error(`parseRefKey: not a reference key: "${key}"`);
  const ref: ScriptureRef = { book_id: m[1]!, chapter: Number(m[2]), verse_start: Number(m[3]) };
  if (m[4] !== undefined) {
    const end = Number(m[4]);
    if (end < ref.verse_start)
      throw new Error(`parseRefKey: range ends before it starts: "${key}"`);
    ref.verse_end = end;
  }
  return ref;
}

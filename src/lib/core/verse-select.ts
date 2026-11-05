// Picks the stored verses a reference covers. Pure, and it never modifies or copies a verse:
// the objects returned are the book's own, so their text reaches VerseText exactly as stored.
// References use the scan's numbering. A range verse stored as {n: 14, to: 15} is one unit: it
// is returned once if any of 14 or 15 is asked for.
import type { ScriptureRef } from './schema';

/** A verse as stored in a published book file (scripture repo format). */
export interface StoredVerse {
  n: number;
  to?: number;
  t: string;
  footnote?: string;
}

/** The parts of a book file the selector reads. */
export interface StoredBook {
  book: string;
  chapters: readonly { n: number; verses: readonly StoredVerse[] }[];
}

export interface VerseSelection<V extends StoredVerse = StoredVerse> {
  /** The covering verses, in book order, each once. */
  verses: V[];
  /** Requested verse numbers the book doesn't have (the whole range if the chapter is missing). */
  missing: number[];
}

export function selectVerses<V extends StoredVerse>(
  book: { chapters: readonly { n: number; verses: readonly V[] }[] },
  ref: Pick<ScriptureRef, 'chapter' | 'verse_start' | 'verse_end'>,
): VerseSelection<V> {
  const first = ref.verse_start;
  const last = Math.max(first, ref.verse_end ?? first);
  const chapter = book.chapters.find((c) => c.n === ref.chapter);
  const wanted: number[] = [];
  for (let n = first; n <= last; n++) wanted.push(n);
  if (!chapter) return { verses: [], missing: wanted };

  const verses: V[] = [];
  const found = new Set<number>();
  for (const v of chapter.verses) {
    const to = v.to ?? v.n;
    if (to < first || v.n > last) continue;
    verses.push(v);
    for (let n = Math.max(v.n, first); n <= Math.min(to, last); n++) found.add(n);
  }
  return { verses, missing: wanted.filter((n) => !found.has(n)) };
}

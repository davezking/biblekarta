// useBook: one published scripture book, fetched at most once per build. The cache is in memory,
// keyed by the index's scriptureVersion and the book id, so a new text release fetches afresh.
// A book that isn't in index.scriptureBooks (not verified, or no text release yet) is 'not-ready'
// and is never fetched. An error drops the cached request, so `retry` fetches again.
// The file is parsed as JSON and handed on untouched: no field is trimmed or normalized.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { StoredBook, StoredVerse } from '../../lib/core/verse-select';

export interface BookData extends StoredBook {
  status?: string;
  edition?: string;
  name_am?: string;
  chapters: { n: number; verses: StoredVerse[] }[];
}

export type BookStatus = 'ready' | 'not-ready' | 'loading' | 'error';

export interface BookState {
  status: BookStatus;
  book?: BookData;
}

export interface UseBookOptions {
  /** index.scriptureBooks: the ids that are published. */
  scriptureBooks: readonly string[];
  /** index.scriptureVersion: the cache key for this build's text. */
  scriptureVersion: string;
  /** Where /data/ is served. */
  base?: string;
  fetch?: typeof fetch;
}

const NOT_READY: BookState = { status: 'not-ready' };
const LOADING: BookState = { status: 'loading' };

const entries = new Map<string, BookState>();
const listeners = new Set<() => void>();

const keyOf = (version: string, id: string) => `${version}\n${id}`;
const set = (key: string, state: BookState) => {
  entries.set(key, state);
  for (const l of [...listeners]) l();
};

/** Starts the fetch for a published book unless it is cached or in flight. */
export function loadBook(id: string, opts: UseBookOptions): void {
  const key = keyOf(opts.scriptureVersion, id);
  const current = entries.get(key);
  if (current && current.status !== 'error') return;
  set(key, LOADING);
  const base = (opts.base ?? '/data/').replace(/\/?$/, '/');
  const doFetch = opts.fetch ?? fetch;
  doFetch(`${base}scripture/${encodeURIComponent(id)}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<BookData>;
    })
    .then((book) => set(key, { status: 'ready', book }))
    .catch(() => set(key, { status: 'error' }));
}

/** Clears the cache (tests). */
export function resetBookCache(): void {
  entries.clear();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBook(id: string, opts: UseBookOptions): BookState & { retry: () => void } {
  const published = opts.scriptureBooks.includes(id);
  const key = keyOf(opts.scriptureVersion, id);
  const snapshot = () => (published ? (entries.get(key) ?? LOADING) : NOT_READY);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);

  const { scriptureBooks, scriptureVersion, base, fetch: f } = opts;
  useEffect(() => {
    if (published) loadBook(id, { scriptureBooks, scriptureVersion, base, fetch: f });
  }, [published, id, scriptureBooks, scriptureVersion, base, f]);

  const retry = useCallback(() => {
    if (published) loadBook(id, { scriptureBooks, scriptureVersion, base, fetch: f });
  }, [published, id, scriptureBooks, scriptureVersion, base, f]);

  return { ...state, retry };
}

// Test helpers for the verse block: the non-scriptural fixture book (never Bible text), served
// through a fetch stub the way the site serves a published book.
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { vi } from 'vitest';
import type { BookData } from '../scripture/useBook';

export const FIXTURE_BYTES = readFileSync('scripture-fixtures/books/fixture.json', 'utf8');
export const fixtureBook = (): BookData => JSON.parse(FIXTURE_BYTES) as BookData;

/** A fetch stub serving `body` for /data/scripture/<id>.json, recording every URL. */
export function serveBooks(body: (id: string) => string | null = () => FIXTURE_BYTES) {
  const urls: string[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    urls.push(url);
    const id = /scripture\/([^/]+)\.json$/.exec(url)?.[1] ?? '';
    const text = body(decodeURIComponent(id));
    return text === null ? new Response('', { status: 500 }) : new Response(text, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, urls };
}

export const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

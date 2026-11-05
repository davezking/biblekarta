// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBookCache, useBook, type BookState, type UseBookOptions } from './useBook';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The non-scriptural fixture book, served as the site serves a published book.
const FIXTURE_BYTES = readFileSync('scripture-fixtures/books/fixture.json', 'utf8');

let roots: { root: Root; el: HTMLElement }[] = [];
beforeEach(() => resetBookCache());
afterEach(() => {
  for (const { root, el } of roots) {
    act(() => root.unmount());
    el.remove();
  }
  roots = [];
});

function serve(...responses: ('ok' | 'fail')[]) {
  const urls: string[] = [];
  // Responses wait for open(), so the loading state can be seen.
  let gate = Promise.resolve();
  let release = () => {};
  const hold = () => {
    gate = new Promise<void>((r) => (release = r));
  };
  const fetchFn = vi.fn(async (url: string) => {
    urls.push(url);
    await gate;
    const r = responses.shift() ?? 'ok';
    return r === 'ok'
      ? new Response(FIXTURE_BYTES, { status: 200 })
      : new Response('', { status: 500 });
  }) as unknown as typeof fetch;
  return { fetchFn, urls, hold, open: () => act(async () => release()) };
}

async function mount(id: string, opts: UseBookOptions) {
  const out: { state: BookState & { retry: () => void } } = {} as never;
  function Probe() {
    out.state = useBook(id, opts);
    return null;
  }
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  roots.push({ root, el });
  await act(async () => root.render(createElement(Probe)));
  return out;
}

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe('useBook', () => {
  it('fetches a published book once and hands it on unchanged', async () => {
    const { fetchFn, urls, hold, open } = serve();
    hold();
    const opts = { scriptureBooks: ['fixture'], scriptureVersion: 'v1', fetch: fetchFn };
    const a = await mount('fixture', opts);
    expect(a.state.status).toBe('loading');
    await open();
    await settle();
    expect(a.state.status).toBe('ready');
    expect(a.state.book).toEqual(JSON.parse(FIXTURE_BYTES));
    expect(urls).toEqual(['/data/scripture/fixture.json']);

    // A second user of the same book and build: served from the cache.
    const b = await mount('fixture', opts);
    expect(b.state.status).toBe('ready');
    expect(b.state.book).toBe(a.state.book);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fetches again for a new text release (scriptureVersion)', async () => {
    const { fetchFn } = serve();
    await mount('fixture', { scriptureBooks: ['fixture'], scriptureVersion: 'v1', fetch: fetchFn });
    await settle();
    await mount('fixture', { scriptureBooks: ['fixture'], scriptureVersion: 'v2', fetch: fetchFn });
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('is not-ready, with no request, for a book that is not published', async () => {
    const { fetchFn } = serve();
    const s = await mount('1ki', {
      scriptureBooks: ['fixture'],
      scriptureVersion: 'v1',
      fetch: fetchFn,
    });
    await settle();
    expect(s.state.status).toBe('not-ready');
    expect(s.state.book).toBeUndefined();
    s.state.retry();
    await settle();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports an error and fetches again on retry', async () => {
    const { fetchFn, hold, open } = serve('fail', 'ok');
    const s = await mount('fixture', {
      scriptureBooks: ['fixture'],
      scriptureVersion: 'v1',
      fetch: fetchFn,
    });
    await settle();
    expect(s.state.status).toBe('error');
    hold();
    await act(async () => s.state.retry());
    expect(s.state.status).toBe('loading');
    await open();
    await settle();
    expect(s.state.status).toBe('ready');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('honours a custom data base', async () => {
    const { fetchFn, urls } = serve();
    await mount('fixture', {
      scriptureBooks: ['fixture'],
      scriptureVersion: 'v1',
      base: '/x/data',
      fetch: fetchFn,
    });
    expect(urls).toEqual(['/x/data/scripture/fixture.json']);
  });
});

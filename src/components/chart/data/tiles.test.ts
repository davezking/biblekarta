import { describe, expect, it, vi } from 'vitest';
import type { TileFile } from '../../../lib/core/datafiles';
import { createTileCache } from './tiles';

const tile = (era: string, buildId = 'b1') => ({ era, buildId }) as unknown as TileFile;

/** A fetch whose responses resolve when the test says so. */
function deferredFetch() {
  const calls: {
    url: string;
    signal: AbortSignal;
    resolve: (t: TileFile) => void;
    fail: () => void;
  }[] = [];
  const fn = vi.fn(
    (url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((res, rej) => {
        init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        calls.push({
          url,
          signal: init.signal,
          resolve: (t) => res(new Response(JSON.stringify(t), { status: 200 })),
          fail: () => res(new Response('nope', { status: 500 })),
        });
      }),
  );
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('createTileCache', () => {
  it('fetches a tile in flight once for concurrent requests, then serves it from memory', async () => {
    const f = deferredFetch();
    const cache = createTileCache({ base: '/data/', fetch: f.fn });
    const a = cache.load('b1', 'era-a', 'tiles/era-a.json');
    const b = cache.load('b1', 'era-a', 'tiles/era-a.json');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('/data/tiles/era-a.json');
    f.calls[0]!.resolve(tile('era-a'));
    expect(await a).toEqual(await b);
    await cache.load('b1', 'era-a', 'tiles/era-a.json');
    expect(f.calls).toHaveLength(1);
    expect(cache.get('b1', 'era-a')).toEqual(tile('era-a'));
  });

  it('aborts a request for an era that leaves the window', async () => {
    const f = deferredFetch();
    const cache = createTileCache({ base: '/data/', fetch: f.fn });
    const a = cache.load('b1', 'a', 'tiles/a.json');
    const b = cache.load('b1', 'b', 'tiles/b.json');
    cache.retain('b1', ['b']);
    expect(f.calls[0]!.signal.aborted).toBe(true);
    expect(f.calls[1]!.signal.aborted).toBe(false);
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    f.calls[1]!.resolve(tile('b'));
    await b;
    expect(cache.get('b1', 'a')).toBeUndefined();
    expect(cache.failed('b1', 'a')).toBe(false);
    // Back in the window, it is fetched again.
    void cache.load('b1', 'a', 'tiles/a.json');
    expect(f.calls).toHaveLength(3);
  });

  it('keeps at most `capacity` tiles, evicting the least recently used outside the window', async () => {
    const f = deferredFetch();
    const cache = createTileCache({ base: '/', capacity: 3, fetch: f.fn });
    const load = async (slug: string) => {
      const p = cache.load('b1', slug, `${slug}.json`);
      f.calls.at(-1)!.resolve(tile(slug));
      await p;
    };
    for (const s of ['a', 'b', 'c']) await load(s);
    cache.get('b1', 'a'); // a is now the most recently used
    cache.retain('b1', ['d']);
    await load('d');
    expect(cache.keys()).toEqual(['b1/c', 'b1/a', 'b1/d']);
    // Tiles in the window are never evicted, even beyond the capacity.
    cache.retain('b1', ['c', 'a', 'd', 'e']);
    await load('e');
    expect(cache.keys().sort()).toEqual(['b1/a', 'b1/c', 'b1/d', 'b1/e']);
    cache.retain('b1', ['e']);
    expect(cache.keys()).toHaveLength(3);
    expect(cache.keys()).toContain('b1/e');
  });

  it('keys by buildId: a new build never reuses an old build’s tile', async () => {
    const f = deferredFetch();
    const cache = createTileCache({ base: '/', fetch: f.fn });
    const old = cache.load('b1', 'a', 'a.json');
    f.calls[0]!.resolve(tile('a', 'b1'));
    await old;
    expect(cache.get('b2', 'a')).toBeUndefined();
    const fresh = cache.load('b2', 'a', 'a.json');
    expect(f.calls).toHaveLength(2);
    f.calls[1]!.resolve(tile('a', 'b2'));
    expect((await fresh).buildId).toBe('b2');
    expect(cache.hasAny('b2')).toBe(true);
    expect(cache.hasAny('b3')).toBe(false);
  });

  it('records a failed tile and does not retry it', async () => {
    const f = deferredFetch();
    const cache = createTileCache({ base: '/', fetch: f.fn });
    const p = cache.load('b1', 'a', 'a.json');
    f.calls[0]!.fail();
    await expect(p).rejects.toThrow(/HTTP 500/);
    expect(cache.failed('b1', 'a')).toBe(true);
    await expect(cache.load('b1', 'a', 'a.json')).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  });
});

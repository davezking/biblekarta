// In-memory tile cache (architecture §9). Offline caching (a service worker) is Phase 4.
//
// - Keyed by buildId + era slug, so a new build never reuses an old build's tiles.
// - A tile requested twice while in flight is fetched once.
// - `retain(window)` aborts in-flight requests for eras that left the window, and evicts the least
//   recently used tiles beyond `capacity`. Tiles in the window are never evicted, even if the
//   window is larger than the capacity.
import type { TileFile } from '../../../lib/core/datafiles';

export const TILE_CAPACITY = 5;

export interface TileCacheOptions {
  /** Where /data/ is served, ending in a slash. */
  base: string;
  capacity?: number;
  fetch?: typeof fetch;
}

export interface TileCache {
  /** A loaded tile (marks it recently used), or undefined. */
  get: (buildId: string, slug: string) => TileFile | undefined;
  /** Loads a tile from `${base}${path}`, sharing a fetch already in flight. */
  load: (buildId: string, slug: string, path: string) => Promise<TileFile>;
  /** Aborts requests outside `slugs` (of this build) and evicts LRU tiles beyond the capacity. */
  retain: (buildId: string, slugs: readonly string[]) => void;
  /** Whether the last load of this tile failed (not aborted); a failed tile isn't retried. */
  failed: (buildId: string, slug: string) => boolean;
  /** Whether any tile of this build is loaded. */
  hasAny: (buildId: string) => boolean;
  /** Keys of the loaded tiles, least recently used first (tests and debugging). */
  keys: () => string[];
}

const keyOf = (buildId: string, slug: string) => `${buildId}/${slug}`;

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === 'AbortError'
    : (err as { name?: string } | null)?.name === 'AbortError';
}

export function createTileCache(o: TileCacheOptions): TileCache {
  const capacity = o.capacity ?? TILE_CAPACITY;
  const doFetch = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  /** Loaded tiles; Map order is recency (oldest first). */
  const loaded = new Map<string, TileFile>();
  const inFlight = new Map<string, { promise: Promise<TileFile>; ctrl: AbortController }>();
  const failures = new Set<string>();
  let retained = new Set<string>();

  const touch = (key: string, tile: TileFile) => {
    loaded.delete(key);
    loaded.set(key, tile);
  };
  const evict = () => {
    for (const key of [...loaded.keys()]) {
      if (loaded.size <= capacity) break;
      if (!retained.has(key)) loaded.delete(key);
    }
  };

  return {
    get: (buildId, slug) => {
      const key = keyOf(buildId, slug);
      const tile = loaded.get(key);
      if (tile) touch(key, tile);
      return tile;
    },
    load: (buildId, slug, path) => {
      const key = keyOf(buildId, slug);
      const hit = loaded.get(key);
      if (failures.has(key)) return Promise.reject(new Error(`${o.base}${path}: failed before`));
      if (hit) {
        touch(key, hit);
        return Promise.resolve(hit);
      }
      const pending = inFlight.get(key);
      if (pending) return pending.promise;
      const ctrl = new AbortController();
      const promise = (async () => {
        const res = await doFetch(`${o.base}${path}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`${o.base}${path}: HTTP ${res.status}`);
        const tile = (await res.json()) as TileFile;
        if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');
        touch(key, tile);
        evict();
        return tile;
      })();
      promise.catch((err: unknown) => {
        if (!isAbort(err)) failures.add(key);
      });
      void promise
        .finally(() => {
          if (inFlight.get(key)?.ctrl === ctrl) inFlight.delete(key);
        })
        .catch(() => {});
      inFlight.set(key, { promise, ctrl });
      return promise;
    },
    retain: (buildId, slugs) => {
      retained = new Set(slugs.map((s) => keyOf(buildId, s)));
      for (const [key, { ctrl }] of inFlight) {
        if (!retained.has(key)) {
          ctrl.abort();
          inFlight.delete(key);
        }
      }
      evict();
    },
    failed: (buildId, slug) => failures.has(keyOf(buildId, slug)),
    hasAny: (buildId) => [...loaded.keys()].some((k) => k.startsWith(`${buildId}/`)),
    keys: () => [...loaded.keys()],
  };
}

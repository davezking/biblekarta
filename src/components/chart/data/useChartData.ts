// Loads the compiled data for the chart (architecture §9): the index once, then the tiles of the
// eras within ±1 era of the committed viewport, merged into one view model and culled to the
// viewport plus one screen width on each side.
//
// Gesture rule (CLAUDE.md): this reads the store's committed viewport (one change per gesture
// end), never the live one, so panning and zooming cause no React commit here.
//
// Errors: if the index can't be loaded there is nothing to chart (status "error"). A tile that
// fails is logged to the console and left out: the chart frame shows, with nothing drawn there.
import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import { INDEX_FILE, type IndexFile, type TileFile } from '../../../lib/core/datafiles';
import { invert, type Axis, type TimescaleConfig } from '../../../lib/layout/timescale';
import { INITIAL_STATE, type ChartState, type ChartStore, type Viewport } from '../state';
import { visibleRange } from '../viewport';
import { cullViewStable, mergeTiles } from './merge';
import { createTileCache, isAbort, type TileCache } from './tiles';
import { erasInWindow } from './window';

export interface ChartData {
  index: IndexFile;
  /** The merged, culled view model of the loaded tiles (the layers' `tile`). */
  tile: TileFile;
}

export type ChartDataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | ({ status: 'ready'; view: TileFile } & ChartData);

const noStore: Pick<ChartStore, 'subscribe' | 'getSnapshot'> = {
  subscribe: () => () => {},
  getSnapshot: () => INITIAL_STATE,
};

/** The axis year at base x `px`; the tradition-only band counts as the domain's start. */
function yearAt(px: number, axis: Axis, cfg: TimescaleConfig): number {
  const at = invert(px, axis, cfg);
  return at.band ? cfg[axis].min : at.year;
}

/** The years a viewport shows on an axis; with no viewport yet, the whole domain (the fit view). */
export function viewportYears(
  v: Viewport | null,
  axis: Axis,
  cfg: TimescaleConfig,
): [number, number] {
  if (!v) return [cfg[axis].min, cfg[axis].max];
  const [x0, x1] = visibleRange(v);
  // Whole years: the one under the left edge, through the one just before the right edge (a
  // view ending exactly where the next era starts does not show that era).
  const y0 = Math.floor(yearAt(x0, axis, cfg));
  const y1 = Math.ceil(yearAt(x1, axis, cfg)) - 1;
  return [y0, Math.max(y0, y1)];
}

/** The view culled to the viewport plus one screen width each side (no viewport: unculled). */
function culled(view: TileFile, axis: Axis, v: Viewport | null): TileFile {
  if (!v) return view;
  return cullViewStable(view, axis, visibleRange(v), v.width / v.k);
}

/**
 * Fetches `${base}index.json`, then the tiles in the window, unless `initial` is given (tests:
 * the data is used as is, still culled to the viewport). `store` supplies the axis and the
 * committed viewport; without one the whole domain is loaded and nothing is culled.
 */
export function useChartData(
  base = '/data/',
  initial?: ChartData,
  store?: Pick<ChartStore, 'subscribe' | 'getSnapshot'>,
): ChartDataState {
  const s = store ?? noStore;
  const snap: ChartState = useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);
  const { axis, committedViewport } = snap;

  const [index, setIndex] = useState<IndexFile | null>(initial?.index ?? null);
  const [error, setError] = useState<string | null>(null);
  // Bumped when a tile arrives or fails, to re-read the cache.
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const [cache] = useState<TileCache>(() => createTileCache({ base }));

  // The index, once.
  useEffect(() => {
    if (initial) return;
    const ctrl = new AbortController();
    (async () => {
      const res = await fetch(`${base}${INDEX_FILE}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`${base}${INDEX_FILE}: HTTP ${res.status}`);
      const loaded = (await res.json()) as IndexFile;
      // Nothing to chart without a live era: report it rather than hand the chart an index it
      // cannot draw.
      if (!loaded.timescale || !loaded.layout) throw new Error('index has no live era to chart');
      setIndex(loaded);
    })().catch((err: unknown) => {
      if (ctrl.signal.aborted) return;
      console.error('chart data:', err);
      setError(err instanceof Error ? err.message : String(err));
    });
    return () => ctrl.abort();
  }, [base, initial]);

  // The eras to hold at this committed viewport (a stable key, so equal windows don't reload).
  const cfg = index?.timescale ?? null;
  const windowKey = useMemo(() => {
    if (!index || !cfg || initial) return '';
    return erasInWindow(index, viewportYears(committedViewport, axis, cfg), axis).join('|');
  }, [index, cfg, axis, committedViewport, initial]);
  const slugs = useMemo(() => (windowKey ? windowKey.split('|') : []), [windowKey]);

  // Load the window's tiles; abort the ones that left it.
  useEffect(() => {
    if (!index || initial) return;
    cache.retain(index.buildId, slugs);
    const paths = new Map(index.eras.map((e) => [e.slug, e.tile]));
    for (const slug of slugs) {
      const path = paths.get(slug);
      if (!path || cache.get(index.buildId, slug) || cache.failed(index.buildId, slug)) continue;
      cache.load(index.buildId, slug, path).then(bump, (err: unknown) => {
        if (isAbort(err)) return;
        console.error(`chart data: tile ${slug}:`, err);
        bump();
      });
    }
  }, [index, slugs, initial, cache]);

  // On unmount, abort every tile request still in flight.
  useEffect(() => () => cache.retain('', []), [cache]);

  // The merged, culled view of what is loaded in the window.
  const merged = useMemo(() => {
    if (initial) return { view: initial.tile, settled: true };
    if (!index) return null;
    const tiles = slugs
      .map((slug) => cache.get(index.buildId, slug))
      .filter((t): t is TileFile => t !== undefined);
    // Ready once the window's tiles have all arrived or failed, or once any tile has loaded (a
    // later window still loading keeps the chart up, showing what is there).
    const settled =
      cache.hasAny(index.buildId) ||
      slugs.every((slug) => cache.failed(index.buildId, slug) || cache.get(index.buildId, slug));
    return { view: mergeTiles(tiles, index), settled, version };
  }, [index, slugs, initial, cache, version]);

  const view = useMemo(
    () => (merged ? culled(merged.view, axis, committedViewport) : null),
    [merged, axis, committedViewport],
  );

  if (error) return { status: 'error', error };
  if (!index || !merged || !view) return { status: 'loading' };
  if (!merged.settled) return { status: 'loading' };
  return { status: 'ready', index, tile: view, view };
}

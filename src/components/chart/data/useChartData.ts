// Loads the compiled data for the chart. A simple version: the index, then the first live era's
// tile. P2-S3-T1 replaces the internals (windowed tile loading) and keeps this return type.
import { useEffect, useState } from 'react';
import { INDEX_FILE, type IndexFile, type TileFile } from '../../../lib/core/datafiles';

export interface ChartData {
  index: IndexFile;
  tile: TileFile;
}

export type ChartDataState =
  { status: 'loading' } | { status: 'error'; error: string } | ({ status: 'ready' } & ChartData);

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Fetches `${base}index.json` and the first live era's tile, unless `initial` is given. */
export function useChartData(base = '/data/', initial?: ChartData): ChartDataState {
  const [state, setState] = useState<ChartDataState>(
    initial ? { status: 'ready', ...initial } : { status: 'loading' },
  );
  useEffect(() => {
    if (initial) return;
    const ctrl = new AbortController();
    (async () => {
      const index = await getJson<IndexFile>(`${base}${INDEX_FILE}`, ctrl.signal);
      const era = index.eras.find((e) => e.status === 'live' && e.tile);
      if (!era?.tile) throw new Error('no live era');
      const tile = await getJson<TileFile>(`${base}${era.tile}`, ctrl.signal);
      setState({ status: 'ready', index, tile });
    })().catch((err: unknown) => {
      if (!ctrl.signal.aborted) {
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    });
    return () => ctrl.abort();
  }, [base, initial]);
  return state;
}

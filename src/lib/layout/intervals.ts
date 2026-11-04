// Packs overlapping x intervals into rows (prophets in the ribbon, events or people in a lane).
// Pure and deterministic: the same input always gives the same rows.

export interface Interval {
  id: string;
  x0: number;
  x1: number;
}

/**
 * Greedy first-fit, in order of x0 then id (so input order never matters). Each item goes in the
 * lowest row whose last item ends at least `gapPx` before it starts; touching intervals share a
 * row when gapPx is 0. Processing by start, this uses the fewest rows possible. Returns the row
 * of every id.
 */
export function packIntervals(items: readonly Interval[], gapPx: number): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.x0 - b.x0 || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  for (const it of sorted) {
    if (rows.has(it.id)) throw new Error(`packIntervals: duplicate id ${it.id}`);
    if (it.x1 < it.x0) throw new RangeError(`packIntervals: ${it.id} ends before it starts`);
    let row = rowEnds.findIndex((end) => end + gapPx <= it.x0);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = it.x1;
    rows.set(it.id, row);
  }
  return rows;
}

/** Number of rows a packing uses. */
export function rowCount(rows: ReadonlyMap<string, number>): number {
  let n = 0;
  for (const r of rows.values()) n = Math.max(n, r + 1);
  return n;
}

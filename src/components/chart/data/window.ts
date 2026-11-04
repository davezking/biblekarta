// Which eras' tiles to load for a viewport (architecture §9): the live eras the viewport touches,
// plus one era either side, so the next era is loaded before it pans on screen. Pure.
import type { IndexEra, IndexFile } from '../../../lib/core/datafiles';
import type { Axis } from '../../../lib/layout/timescale';

/** An era's year span on an axis, or null when it has no years there. */
function span(e: IndexEra, axis: Axis): [number, number] | null {
  const a = e.start?.[axis];
  const b = e.end?.[axis];
  if (a === undefined || b === undefined) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * The slugs of the live eras (with a tile and years on `axis`) that intersect
 * `[y0, y1]`, plus the nearest such era before and after them, in era order. With no era in
 * view (a gap), that is just the nearest era on each side.
 */
export function erasInWindow(
  index: Pick<IndexFile, 'eras'>,
  [y0, y1]: [number, number],
  axis: Axis,
): string[] {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  const eras = index.eras
    .filter((e) => e.status === 'live' && e.tile)
    .map((e) => ({ e, s: span(e, axis) }))
    .filter((x): x is { e: IndexEra; s: [number, number] } => x.s !== null)
    .sort((a, b) => a.s[0] - b.s[0] || a.e.order - b.e.order);
  const inView = eras.filter(({ s }) => s[0] <= hi && s[1] >= lo);
  const before = eras.filter(({ s }) => s[1] < lo).at(-1);
  const after = eras.find(({ s }) => s[0] > hi);
  const pick = new Set([...(before ? [before] : []), ...inView, ...(after ? [after] : [])]);
  return eras.filter((x) => pick.has(x)).map(({ e }) => e.slug);
}

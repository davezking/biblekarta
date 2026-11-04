// Merges loaded era tiles into one view model, in era order, keeping the first copy of each item:
// a stream (or person, source…) spanning two eras is in both tiles, but appears once. The
// geometry is the global layout, so copies in two tiles are identical. Pure.
import type { TileAxis, TileFile } from '../../../lib/core/datafiles';
import type { Unplaced } from '../../../lib/layout/streams';
import type { Axis } from '../../../lib/layout/timescale';
import { visibleItems } from './visible';

const AXES: Axis[] = ['scholarly', 'traditional'];

function uniqueBy<T>(lists: readonly (readonly T[])[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      const k = key(item);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

function mergeUnplaced(lists: readonly Unplaced[]): Unplaced {
  const ids = [...new Set(lists.flatMap((u) => u.ids))].sort();
  return { count: ids.length, ids };
}

function emptyAxis(): TileAxis {
  const none = { count: 0, ids: [] };
  return {
    bands: [],
    reigns: [],
    events: [],
    people: [],
    unplaced: { streams: none, reigns: none, events: none, people: none },
  };
}

/** One tile holding every item of `tiles` once. With no tiles, an empty view (nothing drawn). */
export function mergeTiles(
  tiles: readonly TileFile[],
  meta: { version: TileFile['version']; buildId: string },
): TileFile {
  const axes = {} as Record<Axis, TileAxis>;
  for (const axis of AXES) {
    const parts = tiles.map((t) => t.axes[axis]);
    if (parts.length === 0) {
      axes[axis] = emptyAxis();
      continue;
    }
    const u = (k: keyof TileAxis['unplaced']) => mergeUnplaced(parts.map((p) => p.unplaced[k]));
    axes[axis] = {
      bands: uniqueBy(
        parts.map((p) => p.bands),
        (b) => b.stream_id,
      ),
      reigns: uniqueBy(
        parts.map((p) => p.reigns),
        (r) => r.reign_id,
      ),
      events: uniqueBy(
        parts.map((p) => p.events),
        (e) => e.event_id,
      ),
      people: uniqueBy(
        parts.map((p) => p.people),
        (p) => p.person_id,
      ),
      unplaced: {
        streams: u('streams'),
        reigns: u('reigns'),
        events: u('events'),
        people: u('people'),
      },
    };
  }
  const byId = <T extends { id: string }>(pick: (t: TileFile) => readonly T[]) =>
    uniqueBy(tiles.map(pick), (x) => x.id);
  return {
    version: meta.version,
    buildId: meta.buildId,
    era: tiles.map((t) => t.era).join('+'),
    axes,
    people: byId((t) => t.people),
    reigns: byId((t) => t.reigns),
    events: byId((t) => t.events),
    sources: byId((t) => t.sources),
    anchors: byId((t) => t.anchors),
  };
}

const ids = (geo: TileAxis) =>
  [
    geo.bands.map((b) => b.stream_id).join(','),
    geo.reigns.map((r) => r.reign_id).join(','),
    geo.events.map((e) => e.event_id).join(','),
    geo.people.map((p) => p.person_id).join(','),
  ].join('|');

/** The last culled view per merged view and axis, with the ids it kept. */
const lastCull = new WeakMap<TileFile, Map<Axis, { sig: string; view: TileFile }>>();

/**
 * cullView, but returning the previous result (the same object) when the same items survive, so
 * a commit that keeps the visible set doesn't make every layer recompute.
 */
export function cullViewStable(
  view: TileFile,
  axis: Axis,
  range: [number, number],
  marginPx: number,
): TileFile {
  const next = cullView(view, axis, range, marginPx);
  const sig = ids(next.axes[axis]);
  let perAxis = lastCull.get(view);
  if (!perAxis) lastCull.set(view, (perAxis = new Map()));
  const prev = perAxis.get(axis);
  if (prev && prev.sig === sig) return prev.view;
  perAxis.set(axis, { sig, view: next });
  return next;
}

/** The view with one axis's geometry culled to [x0, x1] ± marginPx (the other axis untouched). */
export function cullView(
  view: TileFile,
  axis: Axis,
  range: [number, number],
  marginPx: number,
): TileFile {
  const geo = view.axes[axis];
  return {
    ...view,
    axes: {
      ...view.axes,
      [axis]: {
        ...geo,
        bands: visibleItems(geo.bands, range, marginPx),
        reigns: visibleItems(geo.reigns, range, marginPx),
        events: visibleItems(geo.events, range, marginPx),
        people: visibleItems(geo.people, range, marginPx),
      },
    },
  };
}

// Where the view goes when the reader switches the primary axis (FR-20, demo step 7). Pure.
//
// 1. Back to an axis the reader left, without having moved since: exactly the view they left.
// 2. Else, if the selection has a placed span on the new axis: centre it, at the same zoom.
// 3. Else: centre the calendar-equivalent year (equivalentYear, a calendar conversion through
//    dates.ts, never a claim that the two chronologies date anything alike), at the same zoom.
//
// Views are clamped as zoom.ts clamps them, so the view the chart lands on is the one returned
// here, and "nothing has moved since" can be checked exactly.
import type { TileFile } from '../../lib/core/datafiles';
import {
  equivalentYear,
  invert,
  totalWidth,
  x as yearToX,
  type Axis,
  type TimescaleConfig,
} from '../../lib/layout/timescale';
import type { Selection } from './state';
import type { View } from './zoom';

/** A view left on an axis, and the view the switch landed on (on the other axis). */
export interface Remembered {
  view: View;
  landed: View;
}

export interface NextViewInput {
  from: Axis;
  to: Axis;
  /** The view now, on `from`. */
  view: View;
  /** Chart width, px. */
  width: number;
  selection: Selection | null;
  tile: TileFile;
  cfg: TimescaleConfig;
  remembered: Partial<Record<Axis, Remembered>>;
}

/** Two views are the same if they differ by less than this (px, and a relative zoom). */
const SAME_PX = 0.5;
const SAME_K = 1e-6;

export function sameView(a: View, b: View): boolean {
  return Math.abs(a.x - b.x) < SAME_PX && Math.abs(a.k / b.k - 1) < SAME_K;
}

/** The view as zoom.ts constrains it on `axis`: k within the zoom range, the content on screen. */
export function clampView(v: View, axis: Axis, cfg: TimescaleConfig, width: number): View {
  const k = Math.min(cfg.zoom.kMax, Math.max(cfg.zoom.kMin, v.k));
  const w = totalWidth(axis, cfg) * k;
  const x = w <= width ? (width - w) / 2 : Math.min(0, Math.max(width - w, v.x));
  return { x, k };
}

/** The base-x span of the selection on an axis (all of a person's reigns and spans), or null. */
export function selectionSpan(
  sel: Selection | null,
  tile: TileFile,
  axis: Axis,
): [number, number] | null {
  if (!sel) return null;
  const geo = tile.axes[axis];
  const spans =
    sel.kind === 'reign'
      ? geo.reigns.filter((r) => r.reign_id === sel.id)
      : sel.kind === 'event'
        ? geo.events.filter((e) => e.event_id === sel.id)
        : [
            ...geo.reigns.filter((r) => r.person_id === sel.id),
            ...geo.people.filter((p) => p.person_id === sel.id),
          ];
  if (spans.length === 0) return null;
  return [Math.min(...spans.map((s) => s.x0)), Math.max(...spans.map((s) => s.x1))];
}

/** The year at the centre of the view on `axis`, as that axis counts it (AA on traditional). */
function centreYear(
  view: View,
  width: number,
  axis: Axis,
  cfg: TimescaleConfig,
): {
  axis: Axis;
  year: number;
} {
  const at = invert((width / 2 - view.x) / view.k, axis, cfg);
  // The tradition-only band (left of the scholarly axis) is counted in AA years.
  return at.band ? { axis: 'traditional', year: at.aa } : { axis, year: at.year };
}

export function nextView(o: NextViewInput): View {
  const { from, to, view, width, cfg } = o;
  if (from === to) return view;
  const back = o.remembered[to];
  if (back && sameView(view, back.landed)) return back.view;

  const centreOn = (px: number) =>
    clampView({ x: width / 2 - px * view.k, k: view.k }, to, cfg, width);
  const span = selectionSpan(o.selection, o.tile, to);
  if (span) return centreOn((span[0] + span[1]) / 2);

  const c = centreYear(view, width, from, cfg);
  return centreOn(yearToX(equivalentYear(c.year, c.axis, to), to, cfg));
}

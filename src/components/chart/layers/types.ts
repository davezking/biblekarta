// The contract every chart layer gets. Layers are mounted by Chart.tsx; Sprint 3 tasks fill them
// in without editing Chart.tsx.
//
// Where each layer is mounted (CLAUDE.md: text never goes in the x-scaled geometry group):
// - grid group (screen space):     GridLayer
// - geometry group (x-scaled):     BandLayer, AnchorLayer, ReignLayer, ProphetLayer, EventLayer
// - labels group (screen space):   AxisLayer, LabelLayer, FigureLayer
// - overlay group (x-scaled):      OverlayLayer
// Inside the x-scaled groups, draw in base coordinates (x at k = 1, from the tile) with
// `vector-effect: non-scaling-stroke`. Screen-space layers map base x to screen x with the
// viewport (screenX = k * x + vx), re-placing their nodes imperatively from `viewport` during a
// gesture and re-rendering only when `committed` changes.
import type { IndexFile, TileFile } from '../../../lib/core/datafiles';
import type { T } from '../../../lib/i18n';
import type { Axis, TimescaleConfig } from '../../../lib/layout/timescale';
import type { Selection, Viewport } from '../state';
import type { ViewportChannel } from '../viewport';

export interface LayerProps {
  index: IndexFile;
  tile: TileFile;
  axis: Axis;
  cfg: TimescaleConfig;
  /** Live viewport during gestures (rAF-throttled); subscribe imperatively, never setState. */
  viewport: ViewportChannel;
  /** The viewport at the last gesture end (one React commit per gesture). */
  committed: Viewport | null;
  /** Top y of each visible lane after hidden lanes are collapsed; hidden lanes are absent. */
  laneY: ReadonlyMap<string, number>;
  /** Total height of the visible lanes. */
  height: number;
  selection: Selection | null;
  t: T;
}

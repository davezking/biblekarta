// Vertical placement of the lanes in the chart's SVG. Lanes come pre-laid-out from the compiler
// (lane-local paths); hiding a lane shifts the lanes after it up by its height, with no re-layout
// (FR-9).
import type { Lane } from '../../lib/layout/streams';

/** Space above the first lane for the year axis (AxisLayer, P2-S2-T5). */
export const AXIS_BAND_PX = 36;

/**
 * Space below the last lane for the axis's bottom row (AxisLayer): a label (13 px), its 8 px inset
 * from the bottom edge and a small gap above, so the row never sits on the last lane.
 */
export const AXIS_BOTTOM_PX = 28;

export interface LanePlacement {
  /** Top y of each visible lane; hidden lanes are absent. */
  laneY: Map<string, number>;
  /** SVG height: the top axis band, the visible lanes and the bottom axis band. */
  height: number;
}

export function placeLanes(lanes: readonly Lane[], hidden: readonly string[]): LanePlacement {
  const skip = new Set(hidden);
  const laneY = new Map<string, number>();
  let y = AXIS_BAND_PX;
  for (const lane of lanes) {
    if (skip.has(lane.id)) continue;
    laneY.set(lane.id, y);
    y += lane.height;
  }
  return { laneY, height: y + AXIS_BOTTOM_PX };
}

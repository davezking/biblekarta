// Vertical placement of the lanes in the chart's SVG. Lanes come pre-laid-out from the compiler
// (lane-local paths); hiding a lane shifts the lanes after it up by its height, with no re-layout
// (FR-9).
import type { Lane } from '../../lib/layout/streams';

/** Space above the first lane for the year axis (AxisLayer, P2-S2-T5). */
export const AXIS_BAND_PX = 36;

export interface LanePlacement {
  /** Top y of each visible lane; hidden lanes are absent. */
  laneY: Map<string, number>;
  /** SVG height: the axis band plus the visible lanes. */
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
  return { laneY, height: y };
}

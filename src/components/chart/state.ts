// The chart's React-visible state, as a tiny external store for useSyncExternalStore.
// The live pan/zoom transform is NOT here: zoom.ts writes it straight to the DOM during a gesture.
// committedViewport changes only at gesture end (and at most every 150 ms in a long gesture), so a
// gesture costs React at most one commit.
import type { Axis } from '../../lib/layout/timescale';

export type SelectionKind = 'reign' | 'person' | 'event';
export interface Selection {
  kind: SelectionKind;
  id: string;
}

/** The view after a gesture: screen x = k * baseX + x (d3-zoom's transform, y always 0). */
export interface Viewport {
  x: number;
  k: number;
  /** Width of the chart in screen px. */
  width: number;
}

export interface ChartState {
  axis: Axis;
  selection: Selection | null;
  /** Ids of collapsed lanes, sorted. */
  hiddenLanes: readonly string[];
  committedViewport: Viewport | null;
}

export interface ChartStore {
  getSnapshot: () => ChartState;
  subscribe: (listener: () => void) => () => void;
  setAxis: (axis: Axis) => void;
  select: (selection: Selection | null) => void;
  setLaneHidden: (laneId: string, hidden: boolean) => void;
  setHiddenLanes: (laneIds: readonly string[]) => void;
  /**
   * Hides a shown lane or shows a hidden one. Hiding the lane the selection is in (per `laneOf`)
   * clears the selection, in the same update.
   */
  toggleLane: (laneId: string, laneOf?: (selection: Selection) => string | undefined) => void;
  /** The selection (same as `select`; the name the URL sync and item pages use). */
  setSelection: (selection: Selection | null) => void;
  /** Applies a restored state (a shared URL, Back) in one update: one notification at most. */
  hydrate: (patch: Partial<Pick<ChartState, 'axis' | 'selection' | 'hiddenLanes'>>) => void;
  commitViewport: (viewport: Viewport) => void;
}

export const INITIAL_STATE: ChartState = {
  axis: 'scholarly',
  selection: null,
  hiddenLanes: [],
  committedViewport: null,
};

const sameViewport = (a: Viewport | null, b: Viewport) =>
  a !== null && a.x === b.x && a.k === b.k && a.width === b.width;
const sortedLanes = (ids: readonly string[]) => [...new Set(ids)].sort();
const sameLanes = (a: readonly string[], b: readonly string[]) => a.join('\n') === b.join('\n');
const sameSelection = (a: Selection | null, b: Selection | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/**
 * A new snapshot object is made only when something changes, so useSyncExternalStore re-renders
 * only on real changes (an unchanged update notifies no one).
 */
export function createChartStore(initial: Partial<ChartState> = {}): ChartStore {
  let state: ChartState = { ...INITIAL_STATE, ...initial };
  const listeners = new Set<() => void>();
  const set = (next: Partial<ChartState>) => {
    state = { ...state, ...next };
    for (const l of [...listeners]) l();
  };
  const select = (selection: Selection | null) => {
    if (!sameSelection(selection, state.selection)) set({ selection });
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAxis: (axis) => {
      if (axis !== state.axis) set({ axis });
    },
    select,
    setSelection: select,
    setLaneHidden: (laneId, hidden) => {
      const has = state.hiddenLanes.includes(laneId);
      if (hidden === has) return;
      const next = hidden
        ? [...state.hiddenLanes, laneId].sort()
        : state.hiddenLanes.filter((id) => id !== laneId);
      set({ hiddenLanes: next });
    },
    setHiddenLanes: (laneIds) => {
      const next = sortedLanes(laneIds);
      if (!sameLanes(next, state.hiddenLanes)) set({ hiddenLanes: next });
    },
    toggleLane: (laneId, laneOf) => {
      if (state.hiddenLanes.includes(laneId)) {
        set({ hiddenLanes: state.hiddenLanes.filter((id) => id !== laneId) });
        return;
      }
      const hiddenLanes = [...state.hiddenLanes, laneId].sort();
      const sel = state.selection;
      set(sel && laneOf?.(sel) === laneId ? { hiddenLanes, selection: null } : { hiddenLanes });
    },
    hydrate: (patch) => {
      const next: Partial<ChartState> = {};
      if (patch.axis !== undefined && patch.axis !== state.axis) next.axis = patch.axis;
      if (patch.selection !== undefined && !sameSelection(patch.selection, state.selection)) {
        next.selection = patch.selection;
      }
      if (patch.hiddenLanes !== undefined) {
        const lanes = sortedLanes(patch.hiddenLanes);
        if (!sameLanes(lanes, state.hiddenLanes)) next.hiddenLanes = lanes;
      }
      if (Object.keys(next).length) set(next);
    },
    commitViewport: (viewport) => {
      if (!sameViewport(state.committedViewport, viewport)) set({ committedViewport: viewport });
    },
  };
}

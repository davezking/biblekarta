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
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAxis: (axis) => {
      if (axis !== state.axis) set({ axis });
    },
    select: (selection) => {
      if (!sameSelection(selection, state.selection)) set({ selection });
    },
    setLaneHidden: (laneId, hidden) => {
      const has = state.hiddenLanes.includes(laneId);
      if (hidden === has) return;
      const next = hidden
        ? [...state.hiddenLanes, laneId].sort()
        : state.hiddenLanes.filter((id) => id !== laneId);
      set({ hiddenLanes: next });
    },
    setHiddenLanes: (laneIds) => {
      const next = [...new Set(laneIds)].sort();
      if (next.join('\n') !== state.hiddenLanes.join('\n')) set({ hiddenLanes: next });
    },
    commitViewport: (viewport) => {
      if (!sameViewport(state.committedViewport, viewport)) set({ committedViewport: viewport });
    },
  };
}

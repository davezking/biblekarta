// The live viewport during a gesture, for layers that re-place screen-space nodes (labels, axis
// ticks) imperatively. Notifications are throttled to one per animation frame, and never touch
// React state: subscribers move DOM nodes themselves.
import type { Viewport } from './state';

export interface ViewportChannel {
  /** The latest viewport (updated on every zoom event, before the throttled notify). */
  get: () => Viewport | null;
  subscribe: (listener: (v: Viewport) => void) => () => void;
  /** Records a viewport and schedules one notify on the next frame. */
  emit: (v: Viewport) => void;
  /**
   * The chart y range the window shows, with a margin (Chart keeps it current as the page
   * scrolls). Screen-space layers leave nodes outside it out of layout; unbounded until known.
   */
  band: () => YBand;
  /** Records a new band and re-notifies the subscribers (with the current viewport) next frame. */
  setBand: (band: YBand) => void;
}

/** A chart y range, [top, bottom]. */
export type YBand = readonly [number, number];
export const ALL_Y: YBand = [-Infinity, Infinity];

type Schedule = (cb: () => void) => unknown;

const defaultSchedule: Schedule =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16);

export function createViewportChannel(schedule: Schedule = defaultSchedule): ViewportChannel {
  let current: Viewport | null = null;
  let pending = false;
  let yBand: YBand = ALL_Y;
  const listeners = new Set<(v: Viewport) => void>();
  const emit = (v: Viewport) => {
    current = v;
    if (pending) return;
    pending = true;
    schedule(() => {
      pending = false;
      if (current) for (const l of [...listeners]) l(current);
    });
  };
  return {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit,
    band: () => yBand,
    setBand: (band) => {
      if (band[0] === yBand[0] && band[1] === yBand[1]) return;
      yBand = band;
      if (current) emit(current);
    },
  };
}

/** Extra screen px kept laid out on either side of the viewport, so a pan reveals ready nodes. */
export const CULL_MARGIN_PX = 160;

/**
 * Whether an item spanning screen x [sx0, sx1] and chart y [y0, y1] is near enough the view to
 * keep in layout (the rest is set to display: none until it comes back).
 */
export function nearView(
  v: Pick<Viewport, 'width'>,
  band: YBand,
  sx0: number,
  sx1: number,
  y0: number,
  y1: number,
): boolean {
  return (
    sx1 >= -CULL_MARGIN_PX && sx0 <= v.width + CULL_MARGIN_PX && y1 >= band[0] && y0 <= band[1]
  );
}

/**
 * The band to keep for a window showing chart y [top, top + height]: a screen height either
 * side. `current` is kept while the window stays well inside it, so scrolling re-places rarely.
 */
export function bandFor(current: YBand, top: number, height: number): YBand {
  const bottom = top + height;
  const bounded = Number.isFinite(current[0]) && Number.isFinite(current[1]);
  if (bounded && top >= current[0] + height / 2 && bottom <= current[1] - height / 2)
    return current;
  return [top - height, bottom + height];
}

/** The base (k = 1) x range a viewport shows. */
export function visibleRange(v: Viewport): [number, number] {
  return [-v.x / v.k, (v.width - v.x) / v.k];
}

/**
 * Whether an item spanning base x [x0, x1] and chart y [y0, y1] is worth rendering for the
 * committed view: within a screen width either side of it (a pan reveals rendered nodes until the
 * next commit), and inside the y band. Everything is, before the first commit.
 */
export function nearCommitted(
  v: Viewport | null,
  band: YBand,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): boolean {
  if (y1 < band[0] || y0 > band[1]) return false;
  if (!v) return true;
  const sx0 = v.k * x0 + v.x;
  const sx1 = v.k * x1 + v.x;
  return sx1 >= -v.width && sx0 <= 2 * v.width;
}

/**
 * A placement runner with a fast path for pan frames. A pan (same zoom) moves every screen-space
 * node by the same Δx, so instead of re-placing each node, the group is shifted with one
 * transform; a full placement runs when the zoom or width changes, or the shift grows past the
 * cull margin (nodes culled beyond it would otherwise show up late). `force` always re-places.
 * Returns the shift applied, or null after a full placement.
 */
export function panShifting(
  root: Element,
  full: (v: Viewport) => void,
  limitPx = CULL_MARGIN_PX,
): (v: Viewport, force?: boolean) => number | null {
  let base: Viewport | null = null;
  // A shift left over from an earlier runner (the layer re-rendered mid-gesture) is dropped.
  root.removeAttribute('transform');
  let shifted = false;
  return (v, force = false) => {
    const dx = base ? Math.round((v.x - base.x) * 10) / 10 : Infinity;
    if (!force && base && v.k === base.k && v.width === base.width && Math.abs(dx) <= limitPx) {
      root.setAttribute('transform', `translate(${dx},0)`);
      shifted = true;
      return dx;
    }
    if (shifted) {
      root.removeAttribute('transform');
      shifted = false;
    }
    full(v);
    base = v;
    return null;
  };
}

/**
 * Whether a node spanning screen x [sx0, sx1] sits across a screen edge, near enough that a pan
 * frame (a shift of at most the cull margin) can change how it is clamped or shown there. Nodes
 * wholly on screen, or well off it, just move with the shifted group.
 */
export function atEdge(v: Pick<Viewport, 'width'>, sx0: number, sx1: number): boolean {
  const reach = 2 * CULL_MARGIN_PX;
  return (sx0 < 0 || sx1 > v.width) && sx1 > -reach && sx0 < v.width + reach;
}

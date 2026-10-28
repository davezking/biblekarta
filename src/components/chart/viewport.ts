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
}

type Schedule = (cb: () => void) => unknown;

const defaultSchedule: Schedule =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16);

export function createViewportChannel(schedule: Schedule = defaultSchedule): ViewportChannel {
  let current: Viewport | null = null;
  let pending = false;
  const listeners = new Set<(v: Viewport) => void>();
  return {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (v) => {
      current = v;
      if (pending) return;
      pending = true;
      schedule(() => {
        pending = false;
        if (current) for (const l of [...listeners]) l(current);
      });
    },
  };
}

/** The base (k = 1) x range a viewport shows. */
export function visibleRange(v: Viewport): [number, number] {
  return [-v.x / v.k, (v.width - v.x) / v.k];
}

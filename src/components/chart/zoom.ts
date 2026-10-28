// Horizontal-only pan and zoom, bound to the chart's <svg> with d3-zoom.
//
// The render/gesture split (CLAUDE.md: no React re-render during pan/zoom):
// - During a gesture, every zoom event writes `translate(x,0) scale(k,1)` straight onto the
//   transformed groups (geometry, overlay) and feeds the rAF-throttled viewport channel, which
//   label layers read imperatively. React state is not touched.
// - The store's committedViewport is updated once at gesture end, and in a long gesture (trackpad
//   inertia) at most every COMMIT_EVERY_MS after LONG_GESTURE_MS.
//
// Input: wheel zooms around the pointer; Shift + wheel and horizontal trackpad scroll pan;
// trackpad pinch (wheel + ctrlKey) and touch pinch zoom; mouse and one-finger drags pan. y is
// always 0, and the SVG has `touch-action: pan-y`, so a vertical swipe still scrolls the page.
//
// Other components move the view only through the ChartController this returns.
import { select, type Selection } from 'd3-selection';
import 'd3-transition';
import {
  zoom,
  zoomIdentity,
  zoomTransform,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom';
import { motion } from '../../lib/core/tokens';
import {
  totalWidth,
  x as yearToX,
  type Axis,
  type TimescaleConfig,
} from '../../lib/layout/timescale';
import type { ChartStore, Viewport } from './state';
import type { ViewportChannel } from './viewport';

/** A wheel sequence ends after this long without a wheel event. */
export const WHEEL_END_MS = 150;
/** A gesture longer than this commits its viewport every COMMIT_EVERY_MS (inertia). */
export const LONG_GESTURE_MS = 1000;
export const COMMIT_EVERY_MS = 150;
/** focusOn leaves this share of the width around the item. */
const FOCUS_FILL = 0.9;

export interface View {
  x: number;
  k: number;
}

export interface ChartController {
  getView: () => View;
  setView: (view: View, opts?: { animate?: boolean }) => void;
  /** Centres a year on the given axis, keeping the zoom. */
  panToYear: (year: number, axis: Axis) => void;
  /** Zooms and pans so the base-x span [x0, x1] fills the width. */
  focusOn: (x0: number, x1: number, opts?: { animate?: boolean }) => void;
}

export interface ZoomOptions {
  svg: SVGSVGElement;
  /** Groups that get the x transform (geometry, overlay). */
  targets: () => Iterable<Element>;
  cfg: TimescaleConfig;
  getAxis: () => Axis;
  store: ChartStore;
  channel: ViewportChannel;
  width: number;
  height: number;
  /** Initial view; defaults to the whole domain fitted to the width. */
  initial?: View;
  now?: () => number;
  reducedMotion?: () => boolean;
}

export interface ZoomHandle extends ChartController {
  resize: (width: number, height: number) => void;
  destroy: () => void;
}

/** d3's default wheel delta, as a zoom exponent. */
function wheelDelta(e: WheelEvent): number {
  return -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1);
}

export function transformAttr(t: { x: number; k: number }): string {
  return `translate(${t.x},0) scale(${t.k},1)`;
}

export function attachZoom(o: ZoomOptions): ZoomHandle {
  const now = o.now ?? (() => Date.now());
  const reducedMotion =
    o.reducedMotion ??
    (() =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let width = o.width;
  let height = o.height;
  const sel: Selection<SVGSVGElement, unknown, null, undefined> = select(o.svg);
  const contentWidth = () => totalWidth(o.getAxis(), o.cfg);

  /** y is always 0; x keeps the content on screen (centred when it is narrower than the view). */
  const constrain = (t: ZoomTransform): ZoomTransform => {
    const w = contentWidth() * t.k;
    const xMin = width - w;
    const tx = w <= width ? (width - w) / 2 : Math.min(0, Math.max(xMin, t.x));
    return tx === t.x && t.y === 0 ? t : zoomIdentity.translate(tx, 0).scale(t.k);
  };

  let wheelActive = false;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  let gestureStart: number | null = null;
  let lastCommit = 0;

  const viewport = (t: View): Viewport => ({ x: t.x, k: t.k, width });
  const commit = () => {
    const t = zoomTransform(o.svg);
    lastCommit = now();
    o.store.commitViewport(viewport(t));
  };

  const behavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
    .scaleExtent([o.cfg.zoom.kMin, o.cfg.zoom.kMax])
    .extent([
      [0, 0],
      [width, height],
    ])
    .constrain((t) => constrain(t))
    // Wheel is handled below (zoom vs pan); d3 keeps drags, touch and pinch.
    .filter((e: Event) => e.type !== 'wheel' && !(e as MouseEvent).button)
    .on('start', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
      if (e.sourceEvent && gestureStart === null) gestureStart = now();
    })
    .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
      const t = e.transform;
      const attr = transformAttr(t);
      for (const el of o.targets()) el.setAttribute('transform', attr);
      o.channel.emit(viewport(t));
      const start = gestureStart;
      if (
        start !== null &&
        now() - start >= LONG_GESTURE_MS &&
        now() - lastCommit >= COMMIT_EVERY_MS
      ) {
        commit();
      }
    })
    .on('end', () => {
      // Each wheel step is a tiny programmatic gesture; the wheel sequence commits once, below.
      if (wheelActive) return;
      gestureStart = null;
      commit();
    });

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!wheelActive) {
      wheelActive = true;
      gestureStart = now();
    }
    const k = zoomTransform(o.svg).k;
    const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (horizontal && !e.ctrlKey) {
      const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      behavior.translateBy(sel, -dx / k, 0);
    } else {
      const r = o.svg.getBoundingClientRect();
      behavior.scaleBy(sel, 2 ** wheelDelta(e), [e.clientX - r.left, e.clientY - r.top]);
    }
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelActive = false;
      gestureStart = null;
      commit();
    }, WHEEL_END_MS);
  };

  sel.call(behavior);
  o.svg.addEventListener('wheel', onWheel, { passive: false });
  // d3 binds dblclick zoom; a double tap on an item should only select it.
  sel.on('dblclick.zoom', null);

  const clampK = (k: number) => Math.min(o.cfg.zoom.kMax, Math.max(o.cfg.zoom.kMin, k));

  // zoom.transform skips constrain(), so programmatic views are clamped here.
  const setView: ChartController['setView'] = (view, opts = {}) => {
    const t = constrain(zoomIdentity.translate(view.x, 0).scale(clampK(view.k)));
    if (opts.animate && !reducedMotion()) {
      sel.transition().duration(motion.slow).call(behavior.transform, t);
    } else {
      sel.call(behavior.transform, t);
    }
  };

  const fit = (): View => ({ x: 0, k: clampK(width / contentWidth()) });
  setView(o.initial ?? fit());

  return {
    getView: () => {
      const t = zoomTransform(o.svg);
      return { x: t.x, k: t.k };
    },
    setView,
    panToYear: (year, axis) => {
      const k = zoomTransform(o.svg).k;
      setView({ x: width / 2 - yearToX(year, axis, o.cfg) * k, k }, { animate: true });
    },
    focusOn: (x0, x1, opts = { animate: true }) => {
      const k = clampK((width * FOCUS_FILL) / Math.max(x1 - x0, 1e-9));
      setView({ x: width / 2 - ((x0 + x1) / 2) * k, k }, opts);
    },
    resize: (w, h) => {
      width = w;
      height = h;
      behavior.extent([
        [0, 0],
        [width, height],
      ]);
      const t = zoomTransform(o.svg);
      setView({ x: t.x, k: t.k });
    },
    destroy: () => {
      clearTimeout(wheelTimer);
      o.svg.removeEventListener('wheel', onWheel);
      sel.interrupt();
      sel.on('.zoom', null);
    },
  };
}
